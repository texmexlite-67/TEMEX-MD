import {
  downloadContentFromMessage,
  getContentType,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import { cleanPhoneNumber } from './env.js';
import { getSudoList, groupCache } from './store.js';

const WRAPPER_TYPES = new Set([
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage'
]);

/**
 * Unwrap nested WhatsApp message containers while tracking whether it was ViewOnce.
 */
export function unwrapMessage(message) {
  if (!message) return { msg: null, isViewOnce: false };
  let cur = message;
  let isViewOnce = false;

  for (let depth = 0; depth < 5 && cur; depth++) {
    if (cur.editedMessage?.message?.protocolMessage?.editedMessage) {
      cur = cur.editedMessage.message.protocolMessage.editedMessage;
      continue;
    }
    const type = getContentType(cur);
    if (!type) break;
    if (type.startsWith('viewOnceMessage')) {
      isViewOnce = true;
    }
    if (WRAPPER_TYPES.has(type) && cur[type]?.message) {
      cur = cur[type].message;
    } else {
      break;
    }
  }

  const finalType = cur ? getContentType(cur) : null;
  if (finalType && cur[finalType]?.viewOnce) {
    isViewOnce = true;
  }

  return { msg: cur, type: finalType, isViewOnce };
}

/**
 * Download media buffer from any image/video/audio/sticker/document content object.
 */
export async function downloadMediaFromContent(contentObj, mtype) {
  if (!contentObj || !mtype) {
    throw new Error('No downloadable media found in message');
  }
  const typeMap = {
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    documentMessage: 'document'
  };
  const streamType = typeMap[mtype] || mtype.replace('Message', '');
  const stream = await downloadContentFromMessage(contentObj, streamType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function extractNumber(jid) {
  if (!jid) return '';
  const norm = jidNormalizedUser(jid);
  const userPart = norm.split('@')[0] || '';
  return cleanPhoneNumber(userPart.split(':')[0]);
}

/**
 * Resolve group metadata using cache first to avoid WhatsApp rate limits.
 */
export async function getGroupMetaSafe(sock, groupJid, forceRefresh = false) {
  if (!groupJid?.endsWith('@g.us')) return null;
  if (!forceRefresh) {
    const cached = groupCache.get(groupJid);
    if (cached) return cached;
  }
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (meta) groupCache.set(groupJid, meta);
    return meta;
  } catch {
    return null;
  }
}

/**
 * Check if a JID/LID/number matches a group participant entry (Baileys v7 LID+PN aware).
 */
export function matchParticipant(participant, targetJids = []) {
  if (!participant) return false;
  const pCandidates = [participant.id, participant.lid, participant.phoneNumber]
    .filter(Boolean)
    .map((j) => jidNormalizedUser(j));

  const pNumbers = pCandidates.map(extractNumber).filter(Boolean);

  for (const t of targetJids.filter(Boolean)) {
    const normT = jidNormalizedUser(t);
    if (pCandidates.includes(normT)) return true;
    const tNum = extractNumber(normT);
    if (tNum && !normT.endsWith('@lid') && pNumbers.includes(tNum)) return true;
  }
  return false;
}

/**
 * Serialize a raw Baileys WAMessage into an ergonomic TEXMEX-MD message object.
 */
export function serializeMessage(sock, raw) {
  if (!raw) return null;

  const m = {
    raw,
    key: raw.key || {},
    id: raw.key?.id || '',
    chat: raw.key?.remoteJid ? jidNormalizedUser(raw.key.remoteJid) : '',
    fromMe: Boolean(raw.key?.fromMe),
    pushName: raw.pushName || 'User',
    timestamp: Number(raw.messageTimestamp || Math.floor(Date.now() / 1000))
  };

  m.isGroup = m.chat.endsWith('@g.us');
  m.isStatus = m.chat === 'status@broadcast';

  const botId = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
  const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : '';
  m.botJid = botId;
  m.botLid = botLid;

  // Determine sender JID & phone number (with Baileys v7 participantAlt / remoteJidAlt support)
  if (m.fromMe) {
    m.sender = botId || m.chat;
    m.senderAlt = botLid || '';
  } else if (m.isGroup || m.isStatus) {
    m.sender = jidNormalizedUser(raw.key?.participant || raw.participant || '');
    m.senderAlt = raw.key?.participantAlt ? jidNormalizedUser(raw.key.participantAlt) : '';
  } else {
    m.sender = m.chat;
    m.senderAlt = raw.key?.remoteJidAlt ? jidNormalizedUser(raw.key.remoteJidAlt) : '';
  }

  const pnCandidate = [m.sender, m.senderAlt].find((j) => j && j.endsWith('@s.whatsapp.net'));
  m.senderNumber = pnCandidate ? extractNumber(pnCandidate) : extractNumber(m.sender);

  // Check Owner / Sudo status
  const sudoNumbers = getSudoList();
  const botNum = extractNumber(botId);
  m.isOwner =
    m.fromMe ||
    (Boolean(m.senderNumber) &&
      (sudoNumbers.includes(m.senderNumber) || (botNum && m.senderNumber === botNum)));

  // Unwrap actual message content
  const { msg, type, isViewOnce } = unwrapMessage(raw.message);
  m.msg = msg;
  m.mtype = type || '';
  m.isViewOnce = isViewOnce;
  m.content = msg && m.mtype ? msg[m.mtype] : null;

  // Extract plain text / caption
  m.text =
    msg?.conversation ||
    m.content?.text ||
    m.content?.caption ||
    m.content?.contentText ||
    m.content?.selectedDisplayText ||
    m.content?.title ||
    m.content?.name ||
    '';

  const contextInfo = m.content?.contextInfo || null;
  m.mentionedJid = (contextInfo?.mentionedJid || []).map((j) => jidNormalizedUser(j));

  // Build quoted message helper if present
  if (contextInfo?.quotedMessage) {
    const qUnwrapped = unwrapMessage(contextInfo.quotedMessage);
    const qSender = contextInfo.participant ? jidNormalizedUser(contextInfo.participant) : '';
    const qContent = qUnwrapped.msg && qUnwrapped.type ? qUnwrapped.msg[qUnwrapped.type] : null;
    m.quoted = {
      id: contextInfo.stanzaId || '',
      chat: contextInfo.remoteJid ? jidNormalizedUser(contextInfo.remoteJid) : m.chat,
      sender: qSender,
      senderNumber: extractNumber(qSender),
      mtype: qUnwrapped.type || '',
      msg: qUnwrapped.msg,
      content: qContent,
      isViewOnce: qUnwrapped.isViewOnce || Boolean(contextInfo.isViewOnce),
      text:
        qUnwrapped.msg?.conversation ||
        qContent?.text ||
        qContent?.caption ||
        '',
      key: {
        remoteJid: contextInfo.remoteJid ? jidNormalizedUser(contextInfo.remoteJid) : m.chat,
        fromMe: qSender === botId || (Boolean(botLid) && qSender === botLid),
        id: contextInfo.stanzaId || '',
        participant: m.isGroup ? qSender : undefined
      },
      download: () => downloadMediaFromContent(qContent, qUnwrapped.type)
    };
  } else {
    m.quoted = null;
  }

  // Convenience methods
  m.download = () => downloadMediaFromContent(m.content, m.mtype);

  m.reply = async (text, extra = {}) => {
    return sock.sendMessage(
      m.chat,
      { text: String(text), ...extra },
      { quoted: raw }
    );
  };

  m.react = async (emoji) => {
    return sock.sendMessage(m.chat, {
      react: { text: emoji, key: raw.key }
    });
  };

  return m;
}
