import { performance } from 'node:perf_hooks';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import config from '../config.js';
import { logger } from './logger.js';
import { findCommand } from './plugins.js';
import {
  serializeMessage,
  getGroupMetaSafe,
  matchParticipant,
  extractNumber
} from './serialize.js';
import {
  getSettings,
  getSlotConfig,
  getGroupConfig,
  addWarning,
  resetWarnings,
  incrementStat,
  cacheIncomingMessage,
  getCachedMessage,
  groupCache,
  registerContactJid,
  isFrozenDm,
  queueFrozenMessageKey,
  consumeFrozenMessageKeys,
  recordLidPnMapping
} from './store.js';
import { sciFiHeader, DEV_SIGNATURE } from './style.js';
import { askTexmexAi } from './ai.js';

const MULTI_PREFIXES = ['.', '!', '/', '#', '$', '-'];
const WA_GROUP_LINK_REGEX = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,26})/i;
const STATUS_MENTION_TYPES = new Set([
  'groupStatusMentionMessage',
  'statusMentionMessage',
  'groupMentionedMessage',
  'groupStatusMessage',
  'groupStatusMessageV2',
  'statusNotificationMessage'
]);

// Anti-Spam sliding window tracker & per-user command cooldown map
const spamTracker = new Map();
const cooldownTracker = new Map();

const MULTI_WORD_COMMANDS = [
  ['self freeze', 'selffreeze'],
  ['self unfreeze', 'selfunfreeze'],
  ['user freeze', 'userfreeze'],
  ['user unfreeze', 'userunfreeze'],
  ['freeze user', 'userfreeze'],
  ['unfreeze user', 'userunfreeze'],
  ['freeze list', 'freezelist'],
  ['frozen list', 'freezelist'],
  ['chat mute', 'chatmute'],
  ['chat unmute', 'chatunmute'],
  ['kick member', 'kickmember'],
  ['add member', 'addmember'],
  ['invite member', 'invitemember'],
  ['g status mention', 'gstatusmention'],
  ['status mention', 'gstatusmention'],
  ['antistatus mention', 'antistatusmention'],
  ['push to status', 'pushstatus'],
  ['push status', 'pushstatus'],
  ['exam prayer', 'examprayer'],
  ['travel prayer', 'travelprayer'],
  ['prosperity prayer', 'prosperityprayer'],
  ['family prayer', 'familyprayer'],
  ['friends prayer', 'friendsprayer'],
  ['self prayer', 'selfprayer'],
  ['group prayer', 'groupprayer'],
  ['motivational prayer', 'motivationalprayer'],
  ['success prayer', 'successprayer'],
  ['failure prayer', 'failureprayer'],
  ['bible to audio', 'bibleaudio'],
  ['bible audio', 'bibleaudio'],
  ['prayer audio', 'prayeraudio'],
  ['push voice', 'pushvoice'],
  ['voice status', 'pushvoice']
];

function resolveCommandCall(body, settings) {
  if (!body || typeof body !== 'string') return null;
  const trimmed = body.trim();
  if (!trimmed) return null;

  const allowedPrefixes = settings.multiPrefix
    ? [...new Set([settings.prefix, ...MULTI_PREFIXES])]
    : [settings.prefix];

  const matchedPrefix = allowedPrefixes.find((p) => p && trimmed.startsWith(p));
  if (!matchedPrefix) return null;

  let withoutPrefix = trimmed.slice(matchedPrefix.length).trim();
  if (!withoutPrefix) return null;

  const lowerBody = withoutPrefix.toLowerCase();
  for (const [phrase, mapped] of MULTI_WORD_COMMANDS) {
    if (lowerBody === phrase || lowerBody.startsWith(`${phrase} `)) {
      withoutPrefix = mapped + withoutPrefix.slice(phrase.length);
      break;
    }
  }

  const parts = withoutPrefix.split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);
  const text = withoutPrefix.slice(parts[0].length).trim();

  return { prefix: matchedPrefix, cmdName, args, text };
}

/**
 * Determine Owner DM target JID for Anti-Delete DM / private alerts.
 */
function getOwnerTargetJid(sock) {
  if (config.ownerNumber) {
    return `${config.ownerNumber}@s.whatsapp.net`;
  }
  if (sock.user?.id) {
    return jidNormalizedUser(sock.user.id);
  }
  return null;
}

/**
 * Handle WhatsApp Status broadcasts (Auto-View & Auto-React).
 */
async function handleStatusBroadcast(sock, raw, settings) {
  if (raw.key?.fromMe) return;
  try {
    if (settings.autoStatusView) {
      await sock.readMessages([raw.key]);
    }
    if (settings.autoStatusReact && raw.key?.participant) {
      const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
      await sock.sendMessage(
        'status@broadcast',
        { react: { text: settings.statusReactEmoji || '💚', key: raw.key } },
        { statusJidList: [raw.key.participant, botJid].filter(Boolean) }
      );
    }
  } catch (err) {
    logger.warn('STATUS', `Auto-status action skipped: ${err.message}`);
  }
}

/**
 * Handle Anti-Delete recovery when protocolMessage REVOKE (type === 0) arrives.
 */
async function handleRevokeIfPresent(sock, raw, settings) {
  if (!settings.antiDelete || settings.antiDelete === 'off') return false;

  const protoMsg =
    raw.message?.protocolMessage ||
    raw.message?.ephemeralMessage?.message?.protocolMessage;

  if (!protoMsg || protoMsg.type !== 0 || !protoMsg.key?.id) {
    return false;
  }

  if (raw.key?.fromMe) return true;

  const cached = getCachedMessage(protoMsg.key.remoteJid || raw.key?.remoteJid, protoMsg.key.id);
  if (!cached || cached.key?.fromMe) return true;

  const serializedCached = serializeMessage(sock, cached);
  if (!serializedCached) return true;

  const targetJid =
    settings.antiDelete === 'chat'
      ? serializedCached.chat
      : getOwnerTargetJid(sock) || serializedCached.chat;

  const deleterJid = jidNormalizedUser(
    raw.key?.participant || raw.key?.remoteJid || serializedCached.sender
  );
  const deleterTag = `@${extractNumber(deleterJid) || 'user'}`;
  const originLabel = serializedCached.isGroup ? `Group (${serializedCached.chat})` : 'Private Chat';

  const header =
    `🛡️ *${config.botName} ANTI-DELETE*\n` +
    `├ *From:* ${deleterTag} (${serializedCached.pushName})\n` +
    `├ *Chat:* ${originLabel}\n` +
    `└ *Time:* ${new Date().toLocaleTimeString()}`;

  try {
    if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(serializedCached.mtype)) {
      const mediaBuf = await serializedCached.download();
      if (serializedCached.mtype === 'imageMessage') {
        await sock.sendMessage(targetJid, {
          image: mediaBuf,
          caption: `${header}\n\n📝 *Caption:* ${serializedCached.text || '_None_'}`,
          mentions: [deleterJid]
        });
      } else if (serializedCached.mtype === 'videoMessage') {
        await sock.sendMessage(targetJid, {
          video: mediaBuf,
          caption: `${header}\n\n📝 *Caption:* ${serializedCached.text || '_None_'}`,
          mentions: [deleterJid]
        });
      } else if (serializedCached.mtype === 'audioMessage') {
        await sock.sendMessage(targetJid, {
          text: header,
          mentions: [deleterJid]
        });
        await sock.sendMessage(targetJid, {
          audio: mediaBuf,
          mimetype: serializedCached.content?.mimetype || 'audio/mp4',
          ptt: Boolean(serializedCached.content?.ptt)
        });
      } else if (serializedCached.mtype === 'stickerMessage') {
        await sock.sendMessage(targetJid, { text: header, mentions: [deleterJid] });
        await sock.sendMessage(targetJid, { sticker: mediaBuf });
      }
    } else if (serializedCached.text) {
      await sock.sendMessage(targetJid, {
        text: `${header}\n\n💬 *Deleted Message:*\n${serializedCached.text}`,
        mentions: [deleterJid]
      });
    }
  } catch (err) {
    logger.warn('ANTIDELETE', `Could not forward deleted message: ${err.message}`);
  }
  return true;
}

/**
 * Detect whether a raw WhatsApp message is a Group Status Mention broadcast/tag.
 */
function isGroupStatusMentionPayload(raw, m) {
  if (!raw?.message) return false;
  for (const t of STATUS_MENTION_TYPES) {
    if (raw.message[t] || m.msg?.[t]) return true;
  }
  if (STATUS_MENTION_TYPES.has(m.mtype)) return true;
  return false;
}

/**
 * Enforce Group Anti-Status-Mention, Anti-Spam, Anti-Link & Anti-Badword protections.
 */
async function enforceGroupProtections(sock, m, groupMeta, isAdmin, isBotAdmin) {
  if (!m.isGroup || m.fromMe || m.isOwner || isAdmin) return false;
  const grpCfg = getGroupConfig(m.chat);
  const bodyLower = (m.text || '').toLowerCase();
  const userTag = `@${m.senderNumber || extractNumber(m.sender)}`;

  // 0A. Anti-Status Mention Protection
  if (
    grpCfg.antistatusmention &&
    grpCfg.antistatusmention !== 'off' &&
    isGroupStatusMentionPayload(m.raw, m)
  ) {
    if (isBotAdmin) {
      await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    }
    if (grpCfg.antistatusmention === 'kick' && isBotAdmin) {
      await sock.sendMessage(m.chat, {
        text: `${sciFiHeader('ANTI-STATUS MENTION')}\n🚫 ${userTag} mentioned this group in a Status and was removed.\n_${DEV_SIGNATURE}_`,
        mentions: [m.sender]
      });
      await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
      return true;
    }
    if (grpCfg.antistatusmention === 'warn') {
      const count = addWarning(m.chat, m.senderNumber || m.sender);
      if (count >= 3 && isBotAdmin) {
        resetWarnings(m.chat, m.senderNumber || m.sender);
        await sock.sendMessage(m.chat, {
          text: `${sciFiHeader('ANTI-STATUS MENTION (3/3)')}\n🚫 ${userTag} reached 3/3 warnings and was removed.\n_${DEV_SIGNATURE}_`,
          mentions: [m.sender]
        });
        await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
      } else {
        await sock.sendMessage(m.chat, {
          text: `${sciFiHeader(`STATUS MENTION WARN (${count}/3)`)}\n⚠️ ${userTag}, mentioning this group in WhatsApp Status is prohibited!`,
          mentions: [m.sender]
        });
      }
      return true;
    }
    await sock.sendMessage(m.chat, {
      text: `${sciFiHeader('ANTI-STATUS MENTION')}\n🚫 ${userTag}, group status mentions are blocked here!`,
      mentions: [m.sender]
    });
    return true;
  }

  // 0B. Anti-Spam Flood Protection (>6 messages inside 6s window)
  if (grpCfg.antispam && grpCfg.antispam !== 'off') {
    const now = Date.now();
    const spamKey = `${m.chat}:${m.sender}`;
    const timestamps = (spamTracker.get(spamKey) || []).filter((t) => now - t < 6000);
    timestamps.push(now);
    spamTracker.set(spamKey, timestamps);

    if (timestamps.length > 6) {
      spamTracker.set(spamKey, []);
      if (isBotAdmin) {
        await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
      }
      if (grpCfg.antispam === 'kick' && isBotAdmin) {
        await sock.sendMessage(m.chat, {
          text: `${sciFiHeader('ANTI-SPAM SHIELD')}\n🚫 ${userTag} was removed for message flooding.\n_${DEV_SIGNATURE}_`,
          mentions: [m.sender]
        });
        await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
        return true;
      }
      const count = addWarning(m.chat, m.senderNumber || m.sender);
      if (count >= 3 && isBotAdmin) {
        resetWarnings(m.chat, m.senderNumber || m.sender);
        await sock.sendMessage(m.chat, {
          text: `${sciFiHeader('ANTI-SPAM (3/3)')}\n🚫 ${userTag} reached 3/3 flood warnings and was removed!`,
          mentions: [m.sender]
        });
        await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
      } else {
        await sock.sendMessage(m.chat, {
          text: `${sciFiHeader(`ANTI-SPAM (${count}/3)`)}\n⚠️ ${userTag}, slow down! Flooding is not allowed in this group.`,
          mentions: [m.sender]
        });
      }
      return true;
    }
  }

  // 1. Anti-Link Protection
  if (grpCfg.antilink && grpCfg.antilink !== 'off' && WA_GROUP_LINK_REGEX.test(m.text || '')) {
    const match = (m.text || '').match(WA_GROUP_LINK_REGEX);
    let isOwnGroupLink = false;
    if (match?.[1] && isBotAdmin) {
      try {
        const ownCode = await sock.groupInviteCode(m.chat);
        if (ownCode && ownCode === match[1]) isOwnGroupLink = true;
      } catch {
        // ignore
      }
    }

    if (!isOwnGroupLink) {
      if (isBotAdmin) {
        await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
      }
      const userTag = `@${m.senderNumber || extractNumber(m.sender)}`;

      if (grpCfg.antilink === 'kick' && isBotAdmin) {
        await sock.sendMessage(m.chat, {
          text: `🚫 *ANTI-LINK TRIGGERED*\n${userTag} sent an unauthorized group link and has been removed.`,
          mentions: [m.sender]
        });
        await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
        return true;
      }

      if (grpCfg.antilink === 'warn') {
        const count = addWarning(m.chat, m.senderNumber || m.sender);
        if (count >= 3 && isBotAdmin) {
          resetWarnings(m.chat, m.senderNumber || m.sender);
          await sock.sendMessage(m.chat, {
            text: `🚫 *ANTI-LINK (3/3 WARNINGS)*\n${userTag} reached maximum warnings and was removed.`,
            mentions: [m.sender]
          });
          await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {});
        } else {
          await sock.sendMessage(m.chat, {
            text: `⚠️ *ANTI-LINK WARNING (${count}/3)*\n${userTag}, sharing WhatsApp group links is not allowed here!`,
            mentions: [m.sender]
          });
        }
        return true;
      }

      // 'delete' or 'on'
      await sock.sendMessage(m.chat, {
        text: `🚫 ${userTag}, group links are prohibited in *${groupMeta?.subject || 'this group'}*!`,
        mentions: [m.sender]
      });
      return true;
    }
  }

  // 2. Anti-Badword Filter
  if (grpCfg.antibadword && Array.isArray(grpCfg.badwords) && grpCfg.badwords.length > 0 && bodyLower) {
    const hit = grpCfg.badwords.find((w) => w && bodyLower.includes(w.toLowerCase()));
    if (hit) {
      if (isBotAdmin) {
        await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {});
      }
      const userTag = `@${m.senderNumber || extractNumber(m.sender)}`;
      await sock.sendMessage(m.chat, {
        text: `⚠️ ${userTag}, please keep the chat respectful. Prohibited word filtered.`,
        mentions: [m.sender]
      });
      return true;
    }
  }

  return false;
}

/**
 * Main incoming messages.upsert dispatcher
 */
export async function handleMessagesUpsert(sock, upsert, botRuntime) {
  if (!upsert?.messages?.length) return;
  const slotId = botRuntime?.slotId || sock?.slotId || 'srv-1';
  const baseSettings = getSettings();
  const slotCfg = slotId !== 'srv-1' ? getSlotConfig(slotId) : null;
  const settings = slotCfg
    ? { ...baseSettings, prefix: slotCfg.prefix || baseSettings.prefix, mode: slotCfg.mode || baseSettings.mode }
    : baseSettings;

  for (const raw of upsert.messages) {
    try {
      const dispatchStart = performance.now();
      if (!raw?.message) continue;

      // Status Broadcasts
      if (raw.key?.remoteJid === 'status@broadcast') {
        await handleStatusBroadcast(sock, raw, settings);
        continue;
      }

      // Check Anti-Delete revoke events first
      const wasRevoke = await handleRevokeIfPresent(sock, raw, settings);
      if (wasRevoke) continue;

      // Cache message for Anti-Delete recovery
      cacheIncomingMessage(raw);
      incrementStat('messagesProcessed');

      // Ignore historical sync bursts older than 2 minutes unless it's a live notify
      if (upsert.type && upsert.type !== 'notify' && !raw.key?.fromMe) {
        continue;
      }

      const m = serializeMessage(sock, raw);
      if (!m || !m.chat) continue;
      m.dispatchStart = dispatchStart;
      m.slotId = slotId;

      if (m.sender && m.senderAlt) {
        recordLidPnMapping(m.sender, m.senderAlt);
      }

      // Sync active phone-number contacts into this Server Slot's Status Push audience
      if (m.sender?.endsWith('@s.whatsapp.net')) registerContactJid(m.sender, slotId);
      if (m.senderAlt?.endsWith('@s.whatsapp.net')) registerContactJid(m.senderAlt, slotId);

      // Single-Grey-Tick DM Freeze check (strictly DMs only — NEVER groups!)
      const botNum = extractNumber(m.botJid);
      const dmFreeze = isFrozenDm(slotId, {
        chatJid: m.chat,
        senderJid: m.sender,
        senderAlt: m.senderAlt || raw.key?.remoteJidAlt || '',
        isGroup: m.isGroup,
        botNumber: botNum
      });

      if (!m.fromMe && dmFreeze.frozen) {
        // Queue unread message key so clicking/opening the DM immediately triggers 2 blue ticks (✓✓)
        queueFrozenMessageKey(slotId, m.chat, raw.key);
        // Suppress autoRead, composing presence, chatbot, and public DM command replies while frozen
        continue;
      }

      // Auto-Read (only for non-frozen messages)
      if (settings.autoRead && !m.fromMe) {
        sock.readMessages([raw.key]).catch(() => {});
      }

      // Resolve Group Protections & Admin Permissions (fast-path skips metadata RPC when unneeded)
      let groupMeta = null;
      let isAdmin = false;
      let isBotAdmin = false;

      const populateGroupPermissions = async () => {
        if (!m.isGroup || groupMeta) return;
        groupMeta = await getGroupMetaSafe(sock, m.chat);
        if (groupMeta?.participants) {
          const senderEntry = groupMeta.participants.find((p) =>
            matchParticipant(p, [m.sender, m.senderAlt])
          );
          const botEntry = groupMeta.participants.find((p) =>
            matchParticipant(p, [m.botJid, m.botLid])
          );
          isAdmin = Boolean(senderEntry?.admin);
          isBotAdmin = Boolean(botEntry?.admin);
        }
      };

      if (m.isGroup) {
        const grpCfg = getGroupConfig(m.chat);
        const hasActiveModeration =
          (grpCfg.antilink && grpCfg.antilink !== 'off') ||
          (grpCfg.antispam && grpCfg.antispam !== 'off') ||
          (grpCfg.antistatusmention && grpCfg.antistatusmention !== 'off') ||
          Boolean(grpCfg.antibadword);

        if (hasActiveModeration) {
          await populateGroupPermissions();
          const blockedByFilter = await enforceGroupProtections(
            sock,
            m,
            groupMeta,
            isAdmin,
            isBotAdmin
          );
          if (blockedByFilter) continue;
        }
      }

      // Parse command invocation
      const parsed = resolveCommandCall(m.text, settings);
      if (!parsed) {
        // If owner replies in a DM, flush any queued frozen messages to 2 blue ticks immediately
        if (m.fromMe && !m.isGroup) {
          const pending = consumeFrozenMessageKeys(slotId, m.chat);
          if (pending.length > 0) {
            sock.readMessages(pending).catch(() => {});
          }
        }

        // Optional Auto-AI Chatbot mode when message is not a command
        const cbMode = settings.chatbotMode || 'off';
        if (cbMode !== 'off' && !m.fromMe && m.text && m.text.trim().length >= 2) {
          const allowDm = !m.isGroup && (cbMode === 'dm' || cbMode === 'all');
          const quotedBot =
            m.quoted?.sender &&
            (m.quoted.sender === m.botJid || (m.botLid && m.quoted.sender === m.botLid));
          const mentionedBot =
            m.mentionedJid.includes(m.botJid) ||
            (Boolean(m.botLid) && m.mentionedJid.includes(m.botLid));
          const allowGroup = m.isGroup && (cbMode === 'group' || cbMode === 'all') && (quotedBot || mentionedBot);

          if (allowDm || allowGroup) {
            sock.sendPresenceUpdate('composing', m.chat).catch(() => {});
            const aiReply = await askTexmexAi(m.text, {
              userKey: m.sender,
              useMemory: true
            });
            if (aiReply) {
              await m.reply(aiReply);
            }
          }
        }
        continue;
      }

      // Mode check: In 'private' mode, only Owner & Sudo can trigger commands
      if (settings.mode === 'private' && !m.isOwner) {
        continue;
      }

      const cmd = findCommand(parsed.cmdName);
      if (!cmd) continue;

      // Lazily populate group permissions only when the command actually needs them
      if (m.isGroup && (cmd.adminOnly || cmd.botAdminOnly || cmd.groupOnly)) {
        await populateGroupPermissions();
      }

      // Command Cooldown (cd) check for non-owners
      const cdSec = Number(settings.cooldownSeconds || 0);
      if (cdSec > 0 && !m.isOwner) {
        const cdKey = `${m.sender}:${cmd.name}`;
        const now = Date.now();
        const prev = cooldownTracker.get(cdKey) || 0;
        const remaining = ((prev + cdSec * 1000 - now) / 1000).toFixed(1);
        if (now - prev < cdSec * 1000) {
          await m.reply(`⏳ ${sciFiHeader('COOLDOWN')} Wait *${remaining}s* before using *${parsed.prefix}${cmd.name}* again.`);
          continue;
        }
        cooldownTracker.set(cdKey, now);
      }

      // Permission guards
      if (cmd.ownerOnly && !m.isOwner) {
        await m.reply(`🔒 This command is restricted to *${config.ownerName}* (Bot Owner / Sudo).`);
        continue;
      }
      if (cmd.groupOnly && !m.isGroup) {
        await m.reply('👥 This command can only be used inside a *WhatsApp Group*.');
        continue;
      }
      if (cmd.adminOnly && m.isGroup && !isAdmin && !m.isOwner) {
        await m.reply('🛡️ You must be a *Group Admin* to use this command.');
        continue;
      }
      if (cmd.botAdminOnly && m.isGroup && !isBotAdmin) {
        await m.reply(`⚠️ Please promote *${config.botName}* to *Group Admin* first so I can perform this action.`);
        continue;
      }

      // Fast-path commands (e.g. .ping) fire immediately without pre-send presence/reaction frames
      if (!cmd.fast) {
        if (!dmFreeze.frozen) {
          if (settings.autoTyping) {
            sock.sendPresenceUpdate('composing', m.chat).catch(() => {});
          } else if (settings.autoRecording) {
            sock.sendPresenceUpdate('recording', m.chat).catch(() => {});
          }
        }
        if (cmd.react) {
          m.react(cmd.react).catch(() => {});
        }
      }

      incrementStat('commandsExecuted');
      logger.info(
        'CMD',
        `${parsed.prefix}${cmd.name} by ${m.pushName} (${m.senderNumber || m.sender}) in ${m.isGroup ? 'Group' : 'DM'}`
      );

      await cmd.execute({
        sock,
        m,
        args: parsed.args,
        text: parsed.text,
        prefix: parsed.prefix,
        cmdName: parsed.cmdName,
        settings,
        config,
        groupMeta,
        isAdmin,
        isBotAdmin,
        botRuntime
      });

      if (cmd.fast && cmd.react) {
        m.react(cmd.react).catch(() => {});
      }
    } catch (err) {
      logger.error('HANDLER', `Error handling message: ${err.message}`);
      try {
        if (raw?.key?.remoteJid && raw.key.remoteJid !== 'status@broadcast') {
          await sock.sendMessage(
            raw.key.remoteJid,
            { text: `❌ *Command Error:* ${err.message}` },
            { quoted: raw }
          );
        }
      } catch {
        // ignore reply failure
      }
    }
  }
}

/**
 * Handle Group Join / Leave Events (Welcome & Goodbye messages + cache refresh)
 */
export async function handleGroupParticipantsUpdate(sock, update) {
  const { id, participants, action } = update || {};
  if (!id || !participants?.length) return;

  // Refresh group metadata cache
  const meta = await getGroupMetaSafe(sock, id, true);
  const grpCfg = getGroupConfig(id);

  if (action === 'add' && grpCfg.welcome) {
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id || p.phoneNumber;
      if (!jid) continue;
      const tag = `@${extractNumber(jid) || 'member'}`;
      const msgText = (grpCfg.welcomeText || 'Welcome @user to *@group*!')
        .replace(/@user/gi, tag)
        .replace(/@group/gi, meta?.subject || 'the group')
        .replace(/@count/gi, String(meta?.participants?.length || ''))
        .replace(/@desc/gi, meta?.desc || '');

      await sock
        .sendMessage(id, { text: msgText, mentions: [jidNormalizedUser(jid)] })
        .catch(() => {});
    }
  } else if (action === 'remove' && grpCfg.goodbye) {
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id || p.phoneNumber;
      if (!jid) continue;
      const tag = `@${extractNumber(jid) || 'member'}`;
      const msgText = (grpCfg.goodbyeText || 'Goodbye @user from *@group*!')
        .replace(/@user/gi, tag)
        .replace(/@group/gi, meta?.subject || 'the group')
        .replace(/@count/gi, String(meta?.participants?.length || ''));

      await sock
        .sendMessage(id, { text: msgText, mentions: [jidNormalizedUser(jid)] })
        .catch(() => {});
    }
  } else {
    groupCache.del(id);
  }
}

/**
 * Handle Incoming Calls (Anti-Call reject / block)
 */
export async function handleIncomingCalls(sock, calls) {
  const settings = getSettings();
  if (!settings.antiCall || settings.antiCall === 'off' || !Array.isArray(calls)) return;

  for (const call of calls) {
    if (call.status !== 'offer') continue;
    try {
      await sock.rejectCall(call.id, call.from);
      await sock.sendMessage(call.from, {
        text:
          `📵 *${config.botName} ANTI-CALL*\n` +
          `Voice/Video calls are disabled for this bot. Please send a text message instead.`
      });
      if (settings.antiCall === 'block') {
        await sock.updateBlockStatus(call.from, 'block');
      }
      logger.info('ANTICALL', `Rejected incoming call from ${call.from}`);
    } catch (err) {
      logger.warn('ANTICALL', `Failed rejecting call: ${err.message}`);
    }
  }
}
