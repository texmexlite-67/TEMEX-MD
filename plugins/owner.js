import {
  updateSettings,
  getSudoList,
  addSudo,
  removeSudo,
  getFreezeState,
  setSelfFreeze,
  addFrozenUser,
  removeFrozenUser,
  consumeFrozenMessageKeys
} from '../lib/store.js';
import { exportSessionId } from '../lib/session.js';
import { loadPlugins } from '../lib/plugins.js';
import { cleanPhoneNumber } from '../lib/env.js';
import { extractNumber } from '../lib/serialize.js';
import { sciFiCard, toCyberCaps } from '../lib/style.js';
import {
  getBotDpBuffer,
  saveCustomBotDp,
  resetCustomBotDp,
  updateWhatsAppDp,
  generateAiImageBuffer
} from '../lib/avatar.js';

function parseOnOff(arg) {
  const v = String(arg || '').toLowerCase();
  if (['on', 'true', 'enable', 'enabled', '1'].includes(v)) return true;
  if (['off', 'false', 'disable', 'disabled', '0'].includes(v)) return false;
  return null;
}

/**
 * Send freeze confirmation privately to Owner's Saved Messages when invoked inside
 * another person's 1-on-1 DM (and delete the command text in that DM for total stealth).
 */
async function sendStealthFreezeReply(sock, m, textPayload) {
  const isOtherPersonDm =
    !m.isGroup &&
    m.chat &&
    m.botJid &&
    m.chat !== m.botJid &&
    (!m.botLid || m.chat !== m.botLid);

  if (isOtherPersonDm) {
    if (m.fromMe && m.raw?.key) {
      await sock.sendMessage(m.chat, { delete: m.raw.key }).catch(() => {});
    }
    return sock.sendMessage(m.botJid, { text: textPayload });
  }
  return m.reply(textPayload);
}

/**
 * Resolve target user JID / LID / phone number from mention, quoted message, phone argument, or current DM.
 */
function resolveFreezeTarget(m, args = []) {
  const filteredArgs = args.filter(
    (a) => !['on', 'off', 'enable', 'disable', 'true', 'false', 'add', 'remove', 'del'].includes(String(a).toLowerCase())
  );

  // 1. Mentioned user (@tag)
  if (Array.isArray(m.mentionedJid) && m.mentionedJid.length > 0) {
    const mentioned = m.mentionedJid[0];
    const num = mentioned.endsWith('@s.whatsapp.net') ? extractNumber(mentioned) : '';
    const lid = mentioned.endsWith('@lid') ? mentioned : '';
    return { number: num, jid: num ? `${num}@s.whatsapp.net` : mentioned, lid, label: num ? `+${num}` : mentioned };
  }

  // 2. Quoted / replied message
  if (m.quoted?.sender) {
    const qSender = m.quoted.sender;
    const qAlt = m.quoted.raw?.key?.participantAlt || m.quoted.raw?.key?.remoteJidAlt || '';
    const pnSource = [qSender, qAlt].find((j) => j && j.endsWith('@s.whatsapp.net')) || '';
    const lidSource = [qSender, qAlt].find((j) => j && j.endsWith('@lid')) || '';
    const num = pnSource ? extractNumber(pnSource) : '';
    return {
      number: num,
      jid: num ? `${num}@s.whatsapp.net` : qSender,
      lid: lidSource,
      label: num ? `+${num}` : qSender
    };
  }

  // 3. Explicit phone number or JID argument
  const rawArg = filteredArgs.join('').trim();
  if (rawArg) {
    if (rawArg.endsWith('@lid')) {
      return { number: '', jid: rawArg, lid: rawArg, label: rawArg };
    }
    const digits = cleanPhoneNumber(rawArg);
    if (digits && digits.length >= 7) {
      return { number: digits, jid: `${digits}@s.whatsapp.net`, lid: '', label: `+${digits}` };
    }
  }

  // 4. Current 1-on-1 DM chat (if not owner's own self-chat)
  if (!m.isGroup && m.chat && m.chat !== m.botJid && (!m.botLid || m.chat !== m.botLid)) {
    const alt = m.raw?.key?.remoteJidAlt || '';
    const pnSource = [m.chat, alt].find((j) => j && j.endsWith('@s.whatsapp.net')) || '';
    const lidSource = [m.chat, alt].find((j) => j && j.endsWith('@lid')) || '';
    const num = pnSource ? extractNumber(pnSource) : '';
    return {
      number: num,
      jid: num ? `${num}@s.whatsapp.net` : m.chat,
      lid: lidSource,
      label: num ? `+${num}` : m.chat
    };
  }

  return null;
}

export default [
  {
    name: 'mode',
    aliases: ['self', 'public'],
    category: 'owner',
    desc: 'Switch TEXMEX-MD between public and private (owner-only) mode',
    usage: '.mode <public | private>',
    ownerOnly: true,
    async execute({ m, args, cmdName }) {
      let target = (args[0] || '').toLowerCase();
      if (cmdName === 'self') target = 'private';
      if (cmdName === 'public') target = 'public';

      if (!['public', 'private'].includes(target)) {
        return m.reply('⚙️ Usage: *.mode public* or *.mode private*');
      }
      updateSettings({ mode: target });
      await m.reply(
        `✅ *TEXMEX-MD Mode Updated:* *${target.toUpperCase()}*\n` +
        (target === 'private'
          ? '🔒 Only TEXMEX-MD Owner & Sudo users can run commands now.'
          : '🌍 Everyone can now use public commands.')
      );
    }
  },
  {
    name: 'setprefix',
    aliases: ['prefix'],
    category: 'owner',
    desc: 'Change the primary command prefix symbol',
    usage: '.setprefix <symbol>',
    ownerOnly: true,
    async execute({ m, args }) {
      const next = (args[0] || '').trim();
      if (!next || next.length > 3) {
        return m.reply('⚙️ Usage: *.setprefix !* (1–3 characters)');
      }
      updateSettings({ prefix: next });
      await m.reply(`✅ Command prefix updated to: *${next}*`);
    }
  },
  {
    name: 'multiprefix',
    aliases: ['mprefix'],
    category: 'owner',
    desc: 'Enable or disable multi-prefix mode (. ! / # $ -)',
    usage: '.multiprefix <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.multiprefix on* or *.multiprefix off*');
      updateSettings({ multiPrefix: val });
      await m.reply(`✅ Multi-Prefix mode is now *${val ? 'ENABLED' : 'DISABLED'}*.`);
    }
  },
  {
    name: 'setbio',
    aliases: ['updatebio', 'mybio', 'syncbio', 'extendbio'],
    category: 'owner',
    desc: 'Force-extend your WhatsApp Bio in cool bold fonts + Website & Port links',
    usage: '.setbio [default | custom text (auto-bolded, URLs kept clickable)]',
    ownerOnly: true,
    react: '📲',
    async execute({ m, text, botRuntime, config }) {
      const input = (text || '').trim();
      if (!input || input.toLowerCase() === 'default' || input.toLowerCase() === 'links') {
        updateSettings({ customBio: '' });
        const appliedName = await botRuntime.applyProfileName('').catch(() => config.links.extendedName);
        const applied = await botRuntime.applyBotBio('');
        return m.reply(
          sciFiCard('FORCE-EXTENDED BIO SYNCED', [
            `👑 *Extended Name:* ${appliedName}`,
            `✅ *Force-Extended Bold Bio (${applied.length} chars):*`,
            applied
          ])
        );
      }
      updateSettings({ customBio: input });
      const applied = await botRuntime.applyBotBio(input);
      await m.reply(
        sciFiCard('EXTENDED BOLD BIO UPDATED', [
          `✅ *Applied (${applied.length} chars):*`,
          applied
        ])
      );
    }
  },
  {
    name: 'setname',
    aliases: ['extendname', 'profilename'],
    category: 'owner',
    desc: 'Force-extend your WhatsApp Display Name in cool bold sci-fi font',
    usage: '.setname [default | custom name]',
    ownerOnly: true,
    react: '👑',
    async execute({ m, text, botRuntime }) {
      const input = (text || '').trim();
      const applied = await botRuntime.applyProfileName(
        !input || input.toLowerCase() === 'default' ? '' : input
      );
      await m.reply(
        sciFiCard('EXTENDED NAME UPDATED', [`👑 *WhatsApp Display Name:* ${applied}`])
      );
    }
  },
  {
    name: 'autobio',
    aliases: ['autosetbio'],
    category: 'owner',
    desc: 'Toggle automatic syncing of Website & Port links to your WhatsApp Bio on startup',
    usage: '.autobio <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.autobio on* or *.autobio off*');
      updateSettings({ autoSetBio: val });
      await m.reply(`✅ Auto-Bio sync is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'autostatus',
    aliases: ['autoviewstatus', 'statusview'],
    category: 'owner',
    desc: 'Toggle automatic viewing of WhatsApp Status updates',
    usage: '.autostatus <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.autostatus on* or *.autostatus off*');
      updateSettings({ autoStatusView: val });
      await m.reply(`✅ Auto-Status View is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'autoreactstatus',
    aliases: ['statusreact'],
    category: 'owner',
    desc: 'Toggle automatic emoji reaction on WhatsApp Statuses',
    usage: '.autoreactstatus <on | off> [emoji]',
    ownerOnly: true,
    async execute({ m, args, settings }) {
      const val = parseOnOff(args[0]);
      if (val === null) {
        return m.reply('⚙️ Usage: *.autoreactstatus on 🔥* or *.autoreactstatus off*');
      }
      const emoji = args[1] || settings.statusReactEmoji || '💚';
      updateSettings({ autoStatusReact: val, statusReactEmoji: emoji });
      await m.reply(
        `✅ Auto-Status React is now *${val ? `ON (${emoji})` : 'OFF'}*.`
      );
    }
  },
  {
    name: 'antidelete',
    aliases: ['antirevoke'],
    category: 'owner',
    desc: 'Configure Anti-Delete recovery (off, chat, or owner dm)',
    usage: '.antidelete <off | chat | dm>',
    ownerOnly: true,
    async execute({ m, args }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['off', 'chat', 'dm'].includes(opt)) {
        return m.reply(
          '⚙️ Usage: *.antidelete <off | chat | dm>*\n' +
          '• *dm* — Recover deleted messages privately to Owner DM\n' +
          '• *chat* — Resend deleted messages right in the same chat\n' +
          '• *off* — Disable Anti-Delete'
        );
      }
      updateSettings({ antiDelete: opt });
      await m.reply(`🛡️ Anti-Delete mode set to: *${opt.toUpperCase()}*`);
    }
  },
  {
    name: 'anticall',
    aliases: [],
    category: 'owner',
    desc: 'Auto-reject (or block) incoming WhatsApp voice/video calls',
    usage: '.anticall <on | off | reject | block>',
    ownerOnly: true,
    react: '📵',
    async execute({ m, args }) {
      let opt = (args[0] || '').toLowerCase();
      if (opt === 'on') opt = 'reject';
      if (!['off', 'reject', 'block'].includes(opt)) {
        return m.reply('⚙️ Usage: *.anticall <on | off | reject | block>*');
      }
      updateSettings({ antiCall: opt });
      await m.reply(`📵 *ANTI-CALL MATRIX:* Mode set to *${opt.toUpperCase()}*`);
    }
  },
  {
    name: 'cd',
    aliases: ['cooldown', 'setcd'],
    category: 'owner',
    desc: 'Configure per-user command cooldown in seconds (0 = instant, e.g. .cd 3)',
    usage: '.cd [seconds]',
    ownerOnly: true,
    react: '⏱️',
    async execute({ m, args, settings }) {
      if (!args.length) {
        return m.reply(
          `⏱️ *COMMAND COOLDOWN (CD):* Currently *${settings.cooldownSeconds || 0}s*\n` +
          `Usage: *.cd 3* (3s cooldown) or *.cd 0* (disable)`
        );
      }
      const sec = Math.max(0, Math.min(120, Number.parseInt(args[0], 10) || 0));
      updateSettings({ cooldownSeconds: sec });
      await m.reply(`⏱️ Command Cooldown (CD) updated to: *${sec}s*`);
    }
  },
  {
    name: 'autoread',
    aliases: [],
    category: 'owner',
    desc: 'Toggle automatic blue-tick read receipts on incoming messages',
    usage: '.autoread <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.autoread on* or *.autoread off*');
      updateSettings({ autoRead: val });
      await m.reply(`✅ Auto-Read is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'autotyping',
    aliases: ['composing'],
    category: 'owner',
    desc: 'Simulate typing indicator before replying to commands',
    usage: '.autotyping <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.autotyping on* or *.autotyping off*');
      updateSettings({ autoTyping: val, ...(val ? { autoRecording: false } : {}) });
      await m.reply(`⌨️ Auto-Typing is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'autorecording',
    aliases: ['recording'],
    category: 'owner',
    desc: 'Simulate voice-recording indicator before replying to commands',
    usage: '.autorecording <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.autorecording on* or *.autorecording off*');
      updateSettings({ autoRecording: val, ...(val ? { autoTyping: false } : {}) });
      await m.reply(`🎙️ Auto-Recording is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'addsudo',
    aliases: ['setsudo'],
    category: 'owner',
    desc: 'Grant Sudo privileges to a user (reply, @mention, or phone number)',
    usage: '.addsudo <@user | number>',
    ownerOnly: true,
    async execute({ m, args }) {
      const target =
        m.quoted?.senderNumber ||
        extractNumber(m.mentionedJid[0]) ||
        cleanPhoneNumber(args[0]);
      if (!target) {
        return m.reply('⚙️ Reply to a user, @mention them, or pass a phone number: *.addsudo 2547XXXXXXXX*');
      }
      addSudo(target);
      await m.reply(`👑 Added *+${target}* to TEXMEX-MD Sudo list.`);
    }
  },
  {
    name: 'delsudo',
    aliases: ['rmsudo'],
    category: 'owner',
    desc: 'Remove Sudo privileges from a user',
    usage: '.delsudo <@user | number>',
    ownerOnly: true,
    async execute({ m, args }) {
      const target =
        m.quoted?.senderNumber ||
        extractNumber(m.mentionedJid[0]) ||
        cleanPhoneNumber(args[0]);
      if (!target) {
        return m.reply('⚙️ Reply to a user, @mention them, or pass a number.');
      }
      const removed = removeSudo(target);
      await m.reply(
        removed
          ? `🗑️ Removed *+${target}* from Sudo list.`
          : `ℹ️ *+${target}* was not in the Sudo list.`
      );
    }
  },
  {
    name: 'listsudo',
    aliases: ['sudo'],
    category: 'owner',
    desc: 'List all phone numbers with TEXMEX-MD Owner/Sudo access',
    usage: '.listsudo',
    ownerOnly: true,
    async execute({ m }) {
      const list = getSudoList();
      if (!list.length) return m.reply('ℹ️ No sudo numbers configured yet.');
      await m.reply(
        `👑 *TEXMEX-MD SUDO USERS (${list.length})*\n` +
        list.map((n, i) => `${i + 1}. +${n}`).join('\n')
      );
    }
  },
  {
    name: 'block',
    aliases: [],
    category: 'owner',
    desc: 'Block a user on WhatsApp (reply, @mention, or in DM)',
    usage: '.block [@user]',
    ownerOnly: true,
    async execute({ sock, m, args }) {
      const jid =
        m.quoted?.sender ||
        m.mentionedJid[0] ||
        (args[0] ? `${cleanPhoneNumber(args[0])}@s.whatsapp.net` : !m.isGroup ? m.chat : '');
      if (!jid) return m.reply('⚙️ Reply to a user, @mention them, or use inside a DM.');
      await sock.updateBlockStatus(jid, 'block');
      await m.reply(`🚫 Blocked *${jid.split('@')[0]}*.`);
    }
  },
  {
    name: 'unblock',
    aliases: [],
    category: 'owner',
    desc: 'Unblock a WhatsApp user',
    usage: '.unblock <@user | number>',
    ownerOnly: true,
    async execute({ sock, m, args }) {
      const jid =
        m.quoted?.sender ||
        m.mentionedJid[0] ||
        (args[0] ? `${cleanPhoneNumber(args[0])}@s.whatsapp.net` : '');
      if (!jid) return m.reply('⚙️ Provide a number or @mention to unblock.');
      await sock.updateBlockStatus(jid, 'unblock');
      await m.reply(`✅ Unblocked *${jid.split('@')[0]}*.`);
    }
  },
  {
    name: 'join',
    aliases: [],
    category: 'owner',
    desc: 'Join a WhatsApp group via invite URL',
    usage: '.join <https://chat.whatsapp.com/...>',
    ownerOnly: true,
    async execute({ sock, m, text }) {
      const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,26})/i);
      if (!match) return m.reply('⚙️ Provide a valid WhatsApp group invite link.');
      const res = await sock.groupAcceptInvite(match[1]);
      await m.reply(`✅ Successfully joined group: *${res || 'Joined'}*`);
    }
  },
  {
    name: 'leave',
    aliases: ['left'],
    category: 'owner',
    desc: 'Make TEXMEX-MD leave the current WhatsApp group',
    usage: '.leave',
    ownerOnly: true,
    groupOnly: true,
    async execute({ sock, m, config }) {
      await m.reply(`👋 *${config.botName}* is leaving this group. Goodbye!`);
      await sock.groupLeave(m.chat);
    }
  },
  {
    name: 'getsession',
    aliases: ['session', 'exportsession'],
    category: 'owner',
    desc: 'Export portable TEXMEX-MD~ SESSION_ID privately to your DM',
    usage: '.getsession',
    ownerOnly: true,
    async execute({ sock, m, config }) {
      const sessionStr = exportSessionId(config.sessionDir);
      if (!sessionStr) {
        return m.reply('⚠️ No active session credentials found on disk.');
      }
      const dmTarget = m.botJid || m.sender;
      await sock.sendMessage(dmTarget, { text: sessionStr });
      await sock.sendMessage(dmTarget, {
        text:
          `🔐 *${config.botName} PORTABLE SESSION_ID*\n\n` +
          `Copy the *TEXMEX-MD~...* string above into your *SESSION_ID* environment variable on Heroku, Render, Koyeb, Railway, Docker, or Panel.\n` +
          `⚠️ *Never share this string publicly!*`
      });
      if (m.isGroup) {
        await m.reply('🔐 Your *TEXMEX-MD~* Session ID has been sent privately to your DM.');
      }
    }
  },
  {
    name: 'reload',
    aliases: ['reloadplugins'],
    category: 'owner',
    desc: 'Hot-reload all command plugins without restarting the socket',
    usage: '.reload',
    ownerOnly: true,
    async execute({ m }) {
      const summary = await loadPlugins();
      await m.reply(`♻️ Reloaded *${summary.totalCommands}* commands across *${summary.categories.length}* categories.`);
    }
  },
  {
    name: 'restart',
    aliases: ['reboot'],
    category: 'owner',
    desc: 'Reconnect the TEXMEX-MD WhatsApp Multi-Device socket cleanly',
    usage: '.restart',
    ownerOnly: true,
    async execute({ m, botRuntime }) {
      await m.reply('🔄 *Restarting TEXMEX-MD WhatsApp connection...*');
      if (botRuntime?.restart) {
        setTimeout(() => botRuntime.restart(), 800);
      }
    }
  },
  {
    name: 'setbotdp',
    aliases: ['setbotpp', 'setppbot'],
    category: 'owner',
    desc: 'Set TEXMEX-MD WhatsApp Profile Picture (reply to image, "default" for built-in Anime AI DP, or "anime <prompt>" to generate a fresh Anime AI DP)',
    usage: '.setbotdp [default | anime <prompt>]',
    ownerOnly: true,
    react: '🖼️',
    async execute({ sock, m, args, config }) {
      const targetMedia = m.quoted?.mtype === 'imageMessage' ? m.quoted : m.mtype === 'imageMessage' ? m : null;
      const sub = (args[0] || '').toLowerCase();

      // Mode 1: Generate a fresh Anime AI Bot DP directly from prompt
      if (sub === 'anime') {
        const prompt =
          args.slice(1).join(' ').trim() ||
          `futuristic cyber-tech anime character representing ${config.botName}, glowing neon emerald headphones, dark techwear hoodie`;
        await m.reply('🎨 *Generating custom Anime AI Bot DP...*');
        const aiBuf = await generateAiImageBuffer(prompt, { anime: true, square: true });
        await saveCustomBotDp(aiBuf);
        await updateWhatsAppDp(sock, m.botJid, aiBuf);
        return sock.sendMessage(
          m.chat,
          {
            image: aiBuf,
            caption: `✅ *${config.botName} Anime AI Bot DP generated & applied to WhatsApp!*`
          },
          { quoted: m.raw }
        );
      }

      // Mode 2: Reply/send a custom image
      if (targetMedia && sub !== 'default') {
        const imgBuf = await targetMedia.download();
        await saveCustomBotDp(imgBuf);
        await updateWhatsAppDp(sock, m.botJid, imgBuf);
        return m.reply(`✅ Updated *${config.botName}* profile picture from image!`);
      }

      // Mode 3: Default built-in TEXMEX-MD Anime AI DP
      resetCustomBotDp();
      const defaultBuf = await getBotDpBuffer('standard');
      if (!defaultBuf) return m.reply('⚠️ Built-in Anime AI Bot DP file not found.');
      await updateWhatsAppDp(sock, m.botJid, defaultBuf);
      await m.reply(`✅ Applied official *${config.botName}* Anime AI Profile Picture!`);
    }
  },
  {
    name: 'fullpp',
    aliases: ['fullbotpp'],
    category: 'owner',
    desc: 'Set a replied portrait/landscape image as Bot DP without cropping',
    usage: '.fullpp (reply to image)',
    ownerOnly: true,
    react: '🖼️',
    async execute({ sock, m, config }) {
      const src = m.quoted?.mtype === 'imageMessage' ? m.quoted : m.mtype === 'imageMessage' ? m : null;
      if (!src) return m.reply('⚙️ Reply to an *image* with *.fullpp* to set an uncropped profile picture.');
      const buf = await src.download();
      await updateWhatsAppDp(sock, m.botJid, buf, { full: true });
      await m.reply(`✅ Applied full uncropped profile picture to *${config.botName}*!`);
    }
  },
  {
    name: 'delbotpp',
    aliases: ['rmbotpp'],
    category: 'owner',
    desc: 'Remove TEXMEX-MD current WhatsApp profile picture',
    usage: '.delbotpp',
    ownerOnly: true,
    async execute({ sock, m }) {
      await sock.removeProfilePicture(m.botJid);
      await m.reply('🗑️ Removed bot WhatsApp profile picture.');
    }
  },
  {
    name: 'menuimage',
    aliases: ['menudp'],
    category: 'owner',
    desc: 'Toggle Anime AI Bot DP image header on .menu and .alive',
    usage: '.menuimage <on | off>',
    ownerOnly: true,
    async execute({ m, args }) {
      const val = parseOnOff(args[0]);
      if (val === null) return m.reply('⚙️ Usage: *.menuimage on* or *.menuimage off*');
      updateSettings({ menuImage: val });
      await m.reply(`🖼️ Menu Anime AI DP banner is now *${val ? 'ON' : 'OFF'}*.`);
    }
  },
  {
    name: 'selffreeze',
    aliases: ['selfunfreeze', 'freezeall', 'dmfreeze', 'ghostdm'],
    category: 'owner',
    desc: 'Make ALL incoming DMs (never groups) act undelivered with a single grey tick (✓) until you click/open the DM to trigger two blue ticks (✓✓)',
    usage: '.self freeze [on | off | status]',
    ownerOnly: true,
    react: '❄️',
    async execute({ sock, m, args, cmdName, prefix, botRuntime }) {
      const slotId = m.slotId || sock?.slotId || 'srv-1';
      const current = getFreezeState(slotId);
      const firstArg = (args[0] || '').toLowerCase();

      if (firstArg === 'status') {
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('SELF FREEZE // STATUS', [
            `❄️ *${toCyberCaps('self freeze')}:* ${current.selfFreeze ? 'ACTIVE (SINGLE GREY TICK ✓)' : 'OFF (NORMAL ✓✓)'}`,
            `🎯 *${toCyberCaps('scope')}:* ALL INCOMING DMs ONLY (Groups Excluded)`,
            `👤 *${toCyberCaps('user freeze list')}:* ${current.frozenUsers.length} user(s)`,
            `💡 *Toggle:* *${prefix}self freeze on* / *${prefix}self freeze off*`
          ])
        );
      }

      let targetState;
      if (cmdName === 'selfunfreeze') {
        targetState = false;
      } else {
        const parsed = parseOnOff(firstArg);
        targetState = parsed !== null ? parsed : !current.selfFreeze;
      }

      const updated = setSelfFreeze(slotId, targetState);
      await botRuntime?.syncFreezePresence?.();

      return sendStealthFreezeReply(
        sock,
        m,
        sciFiCard(
          updated.selfFreeze ? 'SELF FREEZE // ACTIVATED ❄️' : 'SELF FREEZE // DEACTIVATED 🔓',
          updated.selfFreeze
            ? [
                `✅ *${toCyberCaps('status')}:* ON — SINGLE GREY TICK (✓)`,
                `📩 *${toCyberCaps('scope')}:* All Incoming DMs (Groups Excluded)`,
                `👻 *${toCyberCaps('delivery')}:* Senders see 1 grey tick (✓) even while both online`,
                `💎 *${toCyberCaps('blue tick')}:* Senders get 2 blue ticks (✓✓) the moment YOU click/open their DM`,
                `🔓 *Disable anytime:* *${prefix}self freeze off*`
              ]
            : [
                `🔓 *${toCyberCaps('status')}:* OFF — NORMAL DELIVERY (✓✓)`,
                `📩 *${toCyberCaps('scope')}:* Standard WhatsApp DM receipts restored`,
                `👤 *${toCyberCaps('specific frozen users')}:* ${updated.frozenUsers.length} active`
              ]
        )
      );
    }
  },
  {
    name: 'userfreeze',
    aliases: ['userunfreeze', 'freezeuser', 'freeze'],
    category: 'owner',
    desc: 'Make a specific person/user DM act undelivered with a single grey tick (✓) until you click/open their DM to trigger two blue ticks (✓✓)',
    usage: '.user freeze <@user | phone | reply | list | clear>',
    ownerOnly: true,
    react: '🧊',
    async execute({ sock, m, args, cmdName, prefix, botRuntime }) {
      const slotId = m.slotId || sock?.slotId || 'srv-1';
      const firstArg = (args[0] || '').toLowerCase();

      if (firstArg === 'list' || firstArg === 'status') {
        const st = getFreezeState(slotId);
        if (!st.frozenUsers.length) {
          return sendStealthFreezeReply(
            sock,
            m,
            sciFiCard('USER FREEZE // LIST', [
              `🧊 *Frozen Users:* None (0)`,
              `❄️ *Global Self Freeze:* ${st.selfFreeze ? 'ON' : 'OFF'}`,
              `💡 *Usage:* *${prefix}user freeze 2547XXXXXXXX* or reply/tag a user`
            ])
          );
        }
        const rows = st.frozenUsers.map(
          (u, idx) => `${idx + 1}. *${u.label || (u.number ? `+${u.number}` : u.id)}*`
        );
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard(`USER FREEZE // ${st.frozenUsers.length} ACTIVE`, [
            ...rows,
            `💡 *Unfreeze:* *${prefix}unfreeze <number/@user>* or *${prefix}unfreeze all*`
          ])
        );
      }

      if (firstArg === 'clear' || firstArg === 'reset') {
        const res = removeFrozenUser(slotId, 'all');
        await botRuntime?.syncFreezePresence?.();
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('USER FREEZE // CLEARED 🔓', [
            `✅ Unfroze *${res.removed}* user(s). Normal two-grey-tick delivery restored.`
          ])
        );
      }

      const explicitMode =
        cmdName === 'userunfreeze'
          ? false
          : parseOnOff(firstArg);

      const target = resolveFreezeTarget(m, args);
      if (!target || (!target.number && !target.jid && !target.lid)) {
        return m.reply(
          sciFiCard('USER FREEZE // USAGE', [
            `🧊 *Freeze a specific person's DMs (Single Grey Tick ✓):*`,
            `1️⃣ *By Number:* *${prefix}user freeze 254712345678*`,
            `2️⃣ *By Reply:* Reply to their message with *${prefix}user freeze*`,
            `3️⃣ *By Tag:* *${prefix}user freeze @user*`,
            `4️⃣ *In Their DM:* Type *${prefix}user freeze* directly inside their DM`,
            `🔓 *Unfreeze:* *${prefix}user freeze off 254712345678* or *${prefix}unfreeze @user*`
          ])
        );
      }

      // Prevent freezing your own number
      const botNum = extractNumber(m.botJid);
      if (botNum && target.number && target.number === botNum) {
        return m.reply('⚠️ You cannot apply *user freeze* to your own bot number. Use *.self freeze* to freeze all incoming DMs.');
      }

      // If explicit off -> unfreeze
      if (explicitMode === false) {
        const remKey = target.number || target.lid || target.jid;
        const res = removeFrozenUser(slotId, remKey);
        await botRuntime?.syncFreezePresence?.();
        // Flush any pending read receipts if requested
        if (target.jid) {
          const queued = consumeFrozenMessageKeys(slotId, target.jid);
          if (queued.length > 0) sock.readMessages(queued).catch(() => {});
        }
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('USER FREEZE // REMOVED 🔓', [
            `👤 *Target:* ${target.label}`,
            `✅ *Status:* ${res.removed > 0 ? 'UNFROZEN (Normal ✓✓ Delivery)' : 'Was not frozen'}`,
            `📋 *Remaining Frozen Users:* ${res.remaining}`
          ])
        );
      }

      // Add or toggle user freeze
      const added = addFrozenUser(slotId, target);
      if (!added) {
        return m.reply('⚠️ Could not resolve a valid WhatsApp user/phone number to freeze.');
      }

      // If user was already frozen and user didn't pass explicit 'on', toggle OFF for convenience
      if (added.alreadyFrozen && explicitMode === null) {
        const remKey = added.entry.number || added.entry.lid || added.entry.jid;
        const res = removeFrozenUser(slotId, remKey);
        await botRuntime?.syncFreezePresence?.();
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('USER FREEZE // TOGGLED OFF 🔓', [
            `👤 *User:* ${added.entry.label}`,
            `🔓 *Status:* UNFROZEN — Normal delivery ticks (✓✓) restored`,
            `📋 *Active Frozen Users:* ${res.remaining}`
          ])
        );
      }

      await botRuntime?.syncFreezePresence?.();
      return sendStealthFreezeReply(
        sock,
        m,
        sciFiCard('USER FREEZE // ACTIVATED 🧊', [
          `👤 *${toCyberCaps('target')}:* ${added.entry.label}`,
          `✅ *${toCyberCaps('tick mode')}:* SINGLE GREY TICK (✓ UNDELIVERED)`,
          `📩 *${toCyberCaps('scope')}:* Direct Messages from this user only (Not Groups)`,
          `💎 *${toCyberCaps('blue tick')}:* Notifies sender with 2 blue ticks (✓✓) the moment YOU click/open their DM`,
          `🔓 *Unfreeze:* *${prefix}unfreeze ${added.entry.number || ''}*`
        ])
      );
    }
  },
  {
    name: 'unfreeze',
    aliases: ['unfreezeuser', 'clearfreeze'],
    category: 'owner',
    desc: 'Unfreeze a specific user, all frozen users, or self freeze',
    usage: '.unfreeze <@user | phone | reply | self | all>',
    ownerOnly: true,
    react: '🔓',
    async execute({ sock, m, args, prefix, botRuntime }) {
      const slotId = m.slotId || sock?.slotId || 'srv-1';
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'self') {
        setSelfFreeze(slotId, false);
        await botRuntime?.syncFreezePresence?.();
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('SELF FREEZE // DISABLED 🔓', [
            `✅ Global DM *Self Freeze* is now *OFF*. Normal delivery receipts restored.`
          ])
        );
      }

      if (sub === 'all') {
        setSelfFreeze(slotId, false);
        const res = removeFrozenUser(slotId, 'all');
        await botRuntime?.syncFreezePresence?.();
        return sendStealthFreezeReply(
          sock,
          m,
          sciFiCard('ALL FREEZES // CLEARED 🔓', [
            `✅ *Self Freeze:* OFF`,
            `✅ *Unfrozen Users:* ${res.removed} cleared`
          ])
        );
      }

      const target = resolveFreezeTarget(m, args);
      if (!target) {
        return m.reply(
          `⚙️ Usage: *${prefix}unfreeze <number | @user | reply>* or *${prefix}unfreeze self* or *${prefix}unfreeze all*`
        );
      }

      const remKey = target.number || target.lid || target.jid;
      const res = removeFrozenUser(slotId, remKey);
      await botRuntime?.syncFreezePresence?.();
      return sendStealthFreezeReply(
        sock,
        m,
        sciFiCard('USER UNFROZEN 🔓', [
          `👤 *User:* ${target.label}`,
          `✅ *Result:* ${res.removed > 0 ? 'Unfrozen — Normal 2-grey-tick delivery restored' : 'User was not on freeze list'}`,
          `📋 *Remaining Frozen Users:* ${res.remaining}`
        ])
      );
    }
  },
  {
    name: 'freezelist',
    aliases: ['frozenlist', 'frozen'],
    category: 'owner',
    desc: 'View current Self Freeze status and all users under User Freeze',
    usage: '.freezelist',
    ownerOnly: true,
    react: '📋',
    async execute({ sock, m, prefix }) {
      const slotId = m.slotId || sock?.slotId || 'srv-1';
      const st = getFreezeState(slotId);
      const userLines = st.frozenUsers.length
        ? st.frozenUsers.map((u, i) => `  ${i + 1}. *${u.label || `+${u.number}`}*`)
        : ['  _No individual users frozen_'];

      return sendStealthFreezeReply(
        sock,
        m,
        sciFiCard('FREEZE SHIELD // OVERVIEW ❄️', [
          `❄️ *${toCyberCaps('self freeze (all dms)')}:* ${st.selfFreeze ? 'ON (Single Grey Tick ✓)' : 'OFF'}`,
          `🧊 *${toCyberCaps('frozen users')}:* ${st.frozenUsers.length}`,
          ...userLines,
          `💡 *Commands:* *${prefix}self freeze* · *${prefix}user freeze <user>* · *${prefix}unfreeze all*`
        ])
      );
    }
  }
];
