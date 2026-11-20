import { jidNormalizedUser } from '@whiskeysockets/baileys';
import {
  imageToSticker,
  videoToSticker,
  addStickerExif,
  stickerToImage
} from '../lib/sticker.js';
import { cleanPhoneNumber } from '../lib/env.js';

function pickMediaSource(m) {
  if (m.quoted && m.quoted.mtype) return m.quoted;
  return m;
}

export default [
  {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    desc: 'Convert an image or short video/GIF into a TEXMEX-MD WhatsApp sticker',
    usage: '.sticker (caption or reply to image/video)',
    react: '🎨',
    async execute({ sock, m, text, config }) {
      const target = pickMediaSource(m);
      const mtype = target.mtype;

      let packname = config.packname;
      let author = config.author;
      if (text && text.includes('|')) {
        const [p, a] = text.split('|').map((s) => s.trim());
        if (p) packname = p;
        if (a) author = a;
      }

      if (mtype === 'imageMessage') {
        const buf = await target.download();
        const webp = await imageToSticker(buf, { packname, author });
        return sock.sendMessage(m.chat, { sticker: webp }, { quoted: m.raw });
      }

      if (mtype === 'videoMessage') {
        const seconds = Number(target.content?.seconds || 0);
        if (seconds > 12) {
          return m.reply('⚠️ Please reply to a video/GIF that is 10 seconds or shorter.');
        }
        const buf = await target.download();
        const webp = await videoToSticker(buf, { packname, author });
        return sock.sendMessage(m.chat, { sticker: webp }, { quoted: m.raw });
      }

      if (mtype === 'stickerMessage') {
        const buf = await target.download();
        const webp = await addStickerExif(buf, packname, author);
        return sock.sendMessage(m.chat, { sticker: webp }, { quoted: m.raw });
      }

      await m.reply('⚙️ Send or reply to an *image* or short *video/GIF* with *.sticker*');
    }
  },
  {
    name: 'take',
    aliases: ['steal', 'wm'],
    category: 'media',
    desc: 'Re-stamp any sticker with custom Pack | Author EXIF metadata',
    usage: '.take MyPack | MyName (reply to sticker)',
    react: '🏷️',
    async execute({ sock, m, text, config }) {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return m.reply('⚙️ Reply to a *sticker* with *.take PackName | AuthorName*');
      }
      const [packPart, authorPart] = (text || '').split('|').map((s) => s?.trim());
      const packname = packPart || m.pushName || config.packname;
      const author = authorPart || config.ownerName;

      const buf = await m.quoted.download();
      const restamped = await addStickerExif(buf, packname, author);
      await sock.sendMessage(m.chat, { sticker: restamped }, { quoted: m.raw });
    }
  },
  {
    name: 'toimg',
    aliases: ['photo', 'topng'],
    category: 'media',
    desc: 'Convert a static sticker into a standard PNG image',
    usage: '.toimg (reply to sticker)',
    react: '🖼️',
    async execute({ sock, m, config }) {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return m.reply('⚙️ Reply to a *static sticker* with *.toimg*');
      }
      const buf = await m.quoted.download();
      const png = await stickerToImage(buf);
      await sock.sendMessage(
        m.chat,
        { image: png, caption: `🖼️ _Converted by ${config.botName}_` },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'vv',
    aliases: ['viewonce', 'rvo', 'readviewonce'],
    category: 'media',
    desc: 'Unlock & reveal a View-Once image, video, or voice note in chat',
    usage: '.vv (reply to a View-Once message)',
    react: '🔓',
    async execute({ sock, m, config }) {
      if (!m.quoted || !['imageMessage', 'videoMessage', 'audioMessage'].includes(m.quoted.mtype)) {
        return m.reply('⚙️ Reply directly to a *View-Once* photo, video, or voice message with *.vv*');
      }

      const buf = await m.quoted.download();
      const caption =
        `🔓 *${config.botName} VIEW-ONCE UNLOCKED*\n` +
        (m.quoted.text ? `📝 *Caption:* ${m.quoted.text}` : '');

      if (m.quoted.mtype === 'imageMessage') {
        await sock.sendMessage(m.chat, { image: buf, caption }, { quoted: m.raw });
      } else if (m.quoted.mtype === 'videoMessage') {
        await sock.sendMessage(m.chat, { video: buf, caption }, { quoted: m.raw });
      } else if (m.quoted.mtype === 'audioMessage') {
        await sock.sendMessage(
          m.chat,
          {
            audio: buf,
            mimetype: m.quoted.content?.mimetype || 'audio/mp4',
            ptt: Boolean(m.quoted.content?.ptt)
          },
          { quoted: m.raw }
        );
      }
    }
  },
  {
    name: 'vvdm',
    aliases: ['savevv'],
    category: 'media',
    desc: 'Silently unlock a View-Once message and forward it to your private DM',
    usage: '.vvdm (reply to View-Once media)',
    react: '📩',
    async execute({ sock, m, config }) {
      if (!m.quoted || !['imageMessage', 'videoMessage', 'audioMessage'].includes(m.quoted.mtype)) {
        return m.reply('⚙️ Reply to a *View-Once* message with *.vvdm*');
      }
      const dmTarget = m.sender;
      const buf = await m.quoted.download();
      const caption =
        `🔓 *${config.botName} PRIVATE VIEW-ONCE SAVE*\n` +
        (m.quoted.text ? `📝 *Caption:* ${m.quoted.text}` : '');

      if (m.quoted.mtype === 'imageMessage') {
        await sock.sendMessage(dmTarget, { image: buf, caption });
      } else if (m.quoted.mtype === 'videoMessage') {
        await sock.sendMessage(dmTarget, { video: buf, caption });
      } else if (m.quoted.mtype === 'audioMessage') {
        await sock.sendMessage(dmTarget, {
          audio: buf,
          mimetype: m.quoted.content?.mimetype || 'audio/mp4',
          ptt: Boolean(m.quoted.content?.ptt)
        });
      }
    }
  },
  {
    name: 'save',
    aliases: ['statussave', 'downloadstatus'],
    category: 'media',
    desc: 'Save any replied WhatsApp Status or media message to your DM',
    usage: '.save (reply to status or media)',
    react: '💾',
    async execute({ sock, m, config }) {
      if (!m.quoted) {
        return m.reply('⚙️ Reply to a WhatsApp Status or media message with *.save*');
      }
      const dmTarget = m.sender;

      if (['imageMessage', 'videoMessage', 'audioMessage'].includes(m.quoted.mtype)) {
        const buf = await m.quoted.download();
        const cap = m.quoted.text
          ? `${m.quoted.text}\n\n_Saved via ${config.botName}_`
          : `_Saved via ${config.botName}_`;

        if (m.quoted.mtype === 'imageMessage') {
          await sock.sendMessage(dmTarget, { image: buf, caption: cap });
        } else if (m.quoted.mtype === 'videoMessage') {
          await sock.sendMessage(dmTarget, { video: buf, caption: cap });
        } else {
          await sock.sendMessage(dmTarget, {
            audio: buf,
            mimetype: m.quoted.content?.mimetype || 'audio/mp4'
          });
        }
        if (m.isGroup) await m.reply('✅ Media saved to your private DM!');
      } else if (m.quoted.text) {
        await sock.sendMessage(dmTarget, {
          text: `💾 *Saved Text (${config.botName}):*\n\n${m.quoted.text}`
        });
        if (m.isGroup) await m.reply('✅ Text saved to your private DM!');
      } else {
        await m.reply('⚠️ Unsupported message type to save.');
      }
    }
  },
  {
    name: 'getpp',
    aliases: ['pp', 'dp'],
    category: 'media',
    desc: 'Download full-resolution profile picture of a user or group',
    usage: '.getpp [@user | group]',
    react: '📸',
    async execute({ sock, m, args }) {
      let targetJid = m.chat;
      if (m.quoted?.sender) {
        targetJid = jidNormalizedUser(m.quoted.sender);
      } else if (m.mentionedJid?.length) {
        targetJid = jidNormalizedUser(m.mentionedJid[0]);
      } else if (args[0] && args[0].toLowerCase() !== 'group') {
        const num = cleanPhoneNumber(args[0]);
        if (num) targetJid = `${num}@s.whatsapp.net`;
      } else if (!m.isGroup) {
        targetJid = m.chat;
      }

      try {
        const url = await sock.profilePictureUrl(targetJid, 'image');
        await sock.sendMessage(
          m.chat,
          {
            image: { url },
            caption: `📸 *Profile Picture:* ${targetJid.split('@')[0]}`
          },
          { quoted: m.raw }
        );
      } catch {
        await m.reply('⚠️ Profile picture is hidden by privacy settings or not set.');
      }
    }
  }
];
