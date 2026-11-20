import { jidNormalizedUser } from '@whiskeysockets/baileys';
import {
  getGroupConfig,
  updateGroupConfig,
  addWarning,
  resetWarnings,
  getWarnings,
  groupCache
} from '../lib/store.js';
import { extractNumber, getGroupMetaSafe } from '../lib/serialize.js';
import { cleanPhoneNumber } from '../lib/env.js';
import { updateWhatsAppDp } from '../lib/avatar.js';
import { sciFiCard, sciFiHeader, DEV_SIGNATURE } from '../lib/style.js';

function resolveTargetJid(m, args) {
  if (m.quoted?.sender) return jidNormalizedUser(m.quoted.sender);
  if (m.mentionedJid?.length) return jidNormalizedUser(m.mentionedJid[0]);
  const num = cleanPhoneNumber(args[0]);
  return num ? `${num}@s.whatsapp.net` : '';
}

export default [
  {
    name: 'gclink',
    aliases: ['invite', 'link', 'glink'],
    category: 'group',
    desc: 'Fetch the WhatsApp Group Invite Link',
    usage: '.gclink',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '🔗',
    async execute({ sock, m, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const code = await sock.groupInviteCode(m.chat);
      await m.reply(
        sciFiCard('GROUP LINK', [
          `🏷️ *Group:* ${meta?.subject || 'Group'}`,
          `👥 *Members:* ${meta?.participants?.length || 0}`,
          `🔗 https://chat.whatsapp.com/${code}`
        ])
      );
    }
  },
  {
    name: 'revoke',
    aliases: ['resetlink', 'revokelink'],
    category: 'group',
    desc: 'Revoke and regenerate a brand-new group invite link',
    usage: '.revoke',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '♻️',
    async execute({ sock, m }) {
      const newCode = await sock.groupRevokeInvite(m.chat);
      await m.reply(
        sciFiCard('LINK REVOKED', [
          `♻️ Previous link invalidated.`,
          `🔗 https://chat.whatsapp.com/${newCode}`
        ])
      );
    }
  },
  {
    name: 'tag',
    aliases: ['mentionall'],
    category: 'group',
    desc: 'Tag all group members cleanly with a message or replied text',
    usage: '.tag <message>',
    groupOnly: true,
    adminOnly: true,
    react: '📢',
    async execute({ sock, m, text, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const participants = meta?.participants || [];
      const mentions = participants.map((p) => p.id);
      const announcement = text || m.quoted?.text || 'Attention everyone!';
      const tagsLine = participants
        .map((p) => `@${extractNumber(p.phoneNumber || p.id) || p.id.split('@')[0]}`)
        .join(' ');

      await sock.sendMessage(
        m.chat,
        {
          text: `${sciFiHeader('GROUP BROADCAST')}\n\n💬 ${announcement}\n\n${tagsLine}\n\n_${DEV_SIGNATURE}_`,
          mentions
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'tagall',
    aliases: ['everyone', 'all'],
    category: 'group',
    desc: 'Numbered mention list of every member in the group',
    usage: '.tagall [announcement]',
    groupOnly: true,
    adminOnly: true,
    react: '📣',
    async execute({ sock, m, text, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const participants = meta?.participants || [];
      const mentions = participants.map((p) => p.id);

      const header =
        `${sciFiHeader('GROUP TAGALL')}\n` +
        `🏷️ *Group:* ${meta?.subject || 'Group'}\n` +
        `👥 *Members:* ${participants.length}\n` +
        (text ? `💬 *Note:* ${text}\n` : '') +
        `\n`;

      const list = participants
        .map((p, idx) => `${idx + 1}. @${extractNumber(p.phoneNumber || p.id) || p.id.split('@')[0]}`)
        .join('\n');

      await sock.sendMessage(
        m.chat,
        { text: `${header}${list}\n\n_${DEV_SIGNATURE}_`, mentions },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'hidetag',
    aliases: ['htag'],
    category: 'group',
    desc: 'Silently tag all group members without showing @handles',
    usage: '.hidetag <message>',
    groupOnly: true,
    adminOnly: true,
    async execute({ sock, m, text, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const mentions = (meta?.participants || []).map((p) => p.id);
      const body = text || m.quoted?.text || '📢 Group Notice!';
      await sock.sendMessage(m.chat, { text: body, mentions });
    }
  },
  {
    name: 'adminstag',
    aliases: ['tagadmins', 'admins', 'listadmins'],
    category: 'group',
    desc: 'Mention and list all Group Admins in the group',
    usage: '.adminstag [message]',
    groupOnly: true,
    react: '🛡️',
    async execute({ sock, m, text, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const admins = (meta?.participants || []).filter((p) => p.admin);
      const mentions = admins.map((p) => p.id);
      const list = admins
        .map(
          (p, i) =>
            `${i + 1}. @${extractNumber(p.phoneNumber || p.id) || p.id.split('@')[0]} (${p.admin === 'superadmin' ? 'Owner' : 'Admin'})`
        )
        .join('\n');

      const body =
        `${sciFiHeader('GROUP ADMINS')}\n` +
        `🏷️ *Group:* ${meta?.subject || 'Group'}\n` +
        (text ? `💬 *Alert:* ${text}\n` : '') +
        `\n${list}\n\n_${DEV_SIGNATURE}_`;

      await sock.sendMessage(m.chat, { text: body, mentions }, { quoted: m.raw });
    }
  },
  {
    name: 'totag',
    aliases: [],
    category: 'group',
    desc: 'Re-send any replied message/media while silently tagging everyone',
    usage: '.totag (reply to message)',
    groupOnly: true,
    adminOnly: true,
    async execute({ sock, m, groupMeta }) {
      if (!m.quoted) return m.reply('⚙️ Reply to any text or media message with *.totag*.');
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const mentions = (meta?.participants || []).map((p) => p.id);

      if (['imageMessage', 'videoMessage'].includes(m.quoted.mtype)) {
        const buf = await m.quoted.download();
        const key = m.quoted.mtype === 'imageMessage' ? 'image' : 'video';
        await sock.sendMessage(m.chat, {
          [key]: buf,
          caption: m.quoted.text || '',
          mentions
        });
      } else {
        await sock.sendMessage(m.chat, {
          text: m.quoted.text || '📢 Attention everyone!',
          mentions
        });
      }
    }
  },
  {
    name: 'chatmute',
    aliases: ['mute', 'close'],
    category: 'group',
    desc: 'Mute group chat so only Group Admins can send messages (also supports .chat mute)',
    usage: '.chatmute',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '🔒',
    async execute({ sock, m }) {
      await sock.groupSettingUpdate(m.chat, 'announcement');
      groupCache.del(m.chat);
      await m.reply(
        sciFiCard('CHAT MUTED', [
          '🔒 Group chat locked.',
          '🛡️ Only *Group Admins* may send messages now.'
        ])
      );
    }
  },
  {
    name: 'chatunmute',
    aliases: ['unmute', 'open'],
    category: 'group',
    desc: 'Unmute group chat so all members can send messages (also supports .chat unmute)',
    usage: '.chatunmute',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '🔓',
    async execute({ sock, m }) {
      await sock.groupSettingUpdate(m.chat, 'not_announcement');
      groupCache.del(m.chat);
      await m.reply(
        sciFiCard('CHAT UNMUTED', [
          '🔓 Group chat unlocked.',
          '🌍 All *Group Members* can send messages now.'
        ])
      );
    }
  },
  {
    name: 'pin',
    aliases: ['pinmsg'],
    category: 'group',
    desc: 'Pin a replied message at the top of the group chat (24h, 7d, or 30d)',
    usage: '.pin [24h | 7d | 30d] (reply to message)',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '📌',
    async execute({ sock, m, args }) {
      if (!m.quoted?.key?.id) {
        return m.reply('⚙️ Reply to the message you want to pin: *.pin* (or *.pin 30d*)');
      }
      const durArg = (args[0] || '7d').toLowerCase();
      const durationMap = { '24h': 86400, '7d': 604800, '30d': 2592000 };
      const secs = durationMap[durArg] || 604800;

      await sock.sendMessage(m.chat, {
        pin: m.quoted.key,
        type: 1,
        time: secs
      });
      await m.reply(`📌 ${sciFiHeader('MESSAGE PINNED')} Pinned for *${durArg in durationMap ? durArg : '7d'}*!`);
    }
  },
  {
    name: 'unpin',
    aliases: ['unpinmsg'],
    category: 'group',
    desc: 'Unpin a replied pinned message in the group',
    usage: '.unpin (reply to pinned message)',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m }) {
      if (!m.quoted?.key?.id) {
        return m.reply('⚙️ Reply to a pinned message with *.unpin*');
      }
      await sock.sendMessage(m.chat, {
        pin: m.quoted.key,
        type: 2
      });
      await m.reply(`📍 ${sciFiHeader('MESSAGE UNPINNED')} Message unpinned from chat.`);
    }
  },
  {
    name: 'kick',
    aliases: ['kickmember', 'remove'],
    category: 'group',
    desc: 'Kick a member from the group (reply, @mention, or number)',
    usage: '.kick <@user>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '🚪',
    async execute({ sock, m, args }) {
      const target = resolveTargetJid(m, args);
      if (!target) return m.reply('⚙️ Reply to a member or @mention them: *.kick @user*');
      if (target === m.botJid || target === m.botLid) {
        return m.reply('🤖 I cannot kick myself!');
      }
      await sock.groupParticipantsUpdate(m.chat, [target], 'remove');
      groupCache.del(m.chat);
      await sock.sendMessage(m.chat, {
        text: `${sciFiHeader('MEMBER REMOVED')}\n🚪 @${extractNumber(target)} was removed from the group.\n_${DEV_SIGNATURE}_`,
        mentions: [target]
      });
    }
  },
  {
    name: 'add',
    aliases: ['addmember'],
    category: 'group',
    desc: 'Add a member directly to the group by international phone number',
    usage: '.add <2547XXXXXXXX>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '➕',
    async execute({ sock, m, args }) {
      const num = cleanPhoneNumber(args.join(''));
      if (!num || num.length < 7) {
        return m.reply('⚙️ Provide international phone number: *.add 2547XXXXXXXX*');
      }
      const jid = `${num}@s.whatsapp.net`;
      const res = await sock.groupParticipantsUpdate(m.chat, [jid], 'add');
      groupCache.del(m.chat);
      const status = res?.[0]?.status;
      if (status && String(status) !== '200') {
        const code = await sock.groupInviteCode(m.chat);
        return m.reply(
          `⚠️ Could not add +${num} directly (privacy code ${status}).\nUse *.invitemember ${num}* or share: https://chat.whatsapp.com/${code}`
        );
      }
      await sock.sendMessage(m.chat, {
        text: `${sciFiHeader('MEMBER ADDED')}\n✅ Added @${num} to the group!`,
        mentions: [jid]
      });
    }
  },
  {
    name: 'invitemember',
    aliases: ['sendinvite', 'inviteuser'],
    category: 'group',
    desc: 'Send a private WhatsApp group invitation link directly to a user’s DM',
    usage: '.invitemember <2547XXXXXXXX | @user>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    react: '✉️',
    async execute({ sock, m, args, groupMeta }) {
      const target = resolveTargetJid(m, args);
      if (!target) {
        return m.reply('⚙️ Usage: *.invitemember 2547XXXXXXXX* (or reply/@mention user)');
      }
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const code = await sock.groupInviteCode(m.chat);
      const inviteUrl = `https://chat.whatsapp.com/${code}`;

      await sock.sendMessage(target, {
        text: sciFiCard('GROUP INVITATION', [
          `🏷️ *Group:* ${meta?.subject || 'WhatsApp Group'}`,
          `👤 *Invited By:* ${m.pushName}`,
          `🔗 *Join Here:* ${inviteUrl}`
        ])
      });
      await m.reply(`✉️ Group invite link sent privately to *+${extractNumber(target)}*!`);
    }
  },
  {
    name: 'gstatusmention',
    aliases: ['statusmention', 'gstatus', 'tosgroup'],
    category: 'group',
    desc: 'Post replied media/text to WhatsApp Status mentioning all members of this group',
    usage: '.gstatusmention [caption] (reply to media or text)',
    groupOnly: true,
    adminOnly: true,
    react: '📡',
    async execute({ sock, m, text, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const statusJidList = (meta?.participants || [])
        .map((p) => jidNormalizedUser(p.phoneNumber || p.id))
        .filter((j) => j.endsWith('@s.whatsapp.net'));

      if (m.botJid && !statusJidList.includes(m.botJid)) {
        statusJidList.push(m.botJid);
      }

      const src = m.quoted || m;
      const caption = text || src.text || `📢 ${meta?.subject || 'Group'} Status Update`;

      if (src.mtype === 'imageMessage') {
        const buf = await src.download();
        await sock.sendMessage(
          'status@broadcast',
          { image: buf, caption },
          { statusJidList }
        );
      } else if (src.mtype === 'videoMessage') {
        const buf = await src.download();
        await sock.sendMessage(
          'status@broadcast',
          { video: buf, caption },
          { statusJidList }
        );
      } else if (src.mtype === 'audioMessage') {
        const buf = await src.download();
        await sock.sendMessage(
          'status@broadcast',
          { audio: buf, mimetype: src.content?.mimetype || 'audio/mp4', ptt: true },
          { statusJidList }
        );
      } else {
        await sock.sendMessage(
          'status@broadcast',
          { text: caption },
          { backgroundColor: '#070d12', font: 1, statusJidList }
        );
      }

      await m.reply(
        sciFiCard('G-STATUS MENTION SENT', [
          `📡 Broadcasted to *${statusJidList.length}* group participants' Status feed!`,
          `🏷️ *Group:* ${meta?.subject || 'Group'}`
        ])
      );
    }
  },
  {
    name: 'gprofile',
    aliases: ['setgpp', 'setgrouppp', 'gpp'],
    category: 'group',
    desc: 'View the Group Profile Picture & info, or reply to an image to update Group DP',
    usage: '.gprofile [full] (optional reply to image)',
    groupOnly: true,
    react: '🖼️',
    async execute({ sock, m, args, groupMeta, isAdmin, isBotAdmin }) {
      const imgSrc =
        m.quoted?.mtype === 'imageMessage'
          ? m.quoted
          : m.mtype === 'imageMessage'
            ? m
            : null;

      // Update Group DP if replying to an image
      if (imgSrc) {
        if (!isAdmin && !m.isOwner) {
          return m.reply('🛡️ Only Group Admins can change the group profile picture.');
        }
        if (!isBotAdmin) {
          return m.reply('⚠️ Promote TEXMEX-MD to Group Admin first to update the group icon.');
        }
        const full = (args[0] || '').toLowerCase() === 'full';
        const buf = await imgSrc.download();
        await updateWhatsAppDp(sock, m.chat, buf, { full });
        return m.reply(
          sciFiCard('GROUP PROFILE UPDATED', [
            `✅ Group profile icon updated${full ? ' (Uncropped Full Square)' : ''}!`
          ])
        );
      }

      // Otherwise fetch & display Group Profile Picture + Card
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      const caption = sciFiCard('GROUP PROFILE', [
        `🏷️ *Name:* ${meta?.subject || 'Group'}`,
        `👥 *Members:* ${meta?.participants?.length || 0}`,
        `🔒 *Chat Mode:* ${meta?.announce ? 'Muted (Admins Only)' : 'Open (All Members)'}`,
        `💡 _Tip: Reply to an image with .gprofile to change group icon_`
      ]);

      try {
        const ppUrl = await sock.profilePictureUrl(m.chat, 'image');
        await sock.sendMessage(
          m.chat,
          { image: { url: ppUrl }, caption },
          { quoted: m.raw }
        );
      } catch {
        await m.reply(caption);
      }
    }
  },
  {
    name: 'gabout',
    aliases: ['setgdesc', 'setdesc', 'gdesc'],
    category: 'group',
    desc: 'View the Group About/Description, or pass new text to update it',
    usage: '.gabout [new description]',
    groupOnly: true,
    react: '📝',
    async execute({ sock, m, text, groupMeta, isAdmin, isBotAdmin }) {
      if (!text) {
        const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
        return m.reply(
          sciFiCard('GROUP ABOUT', [
            `🏷️ *Group:* ${meta?.subject || 'Group'}`,
            `📝 *Description:*`,
            `${meta?.desc || '_No group description set._'}`
          ])
        );
      }

      if (!isAdmin && !m.isOwner) {
        return m.reply('🛡️ Only Group Admins can update the group description.');
      }
      if (!isBotAdmin) {
        return m.reply('⚠️ Promote TEXMEX-MD to Group Admin first.');
      }
      await sock.groupUpdateDescription(m.chat, text);
      groupCache.del(m.chat);
      await m.reply(
        sciFiCard('GROUP ABOUT UPDATED', [
          `✅ Updated group description:`,
          `${text}`
        ])
      );
    }
  },
  {
    name: 'promote',
    aliases: ['admin'],
    category: 'group',
    desc: 'Promote a member to Group Admin',
    usage: '.promote <@user>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m, args }) {
      const target = resolveTargetJid(m, args);
      if (!target) return m.reply('⚙️ Reply to a member or @mention them to promote.');
      await sock.groupParticipantsUpdate(m.chat, [target], 'promote');
      groupCache.del(m.chat);
      await sock.sendMessage(m.chat, {
        text: `🎖️ ${sciFiHeader('ADMIN PROMOTED')} @${extractNumber(target)} is now a *Group Admin*!`,
        mentions: [target]
      });
    }
  },
  {
    name: 'demote',
    aliases: ['unadmin'],
    category: 'group',
    desc: 'Demote a Group Admin back to regular member',
    usage: '.demote <@user>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m, args }) {
      const target = resolveTargetJid(m, args);
      if (!target) return m.reply('⚙️ Reply to an admin or @mention them to demote.');
      await sock.groupParticipantsUpdate(m.chat, [target], 'demote');
      groupCache.del(m.chat);
      await sock.sendMessage(m.chat, {
        text: `📉 ${sciFiHeader('ADMIN DEMOTED')} @${extractNumber(target)} is no longer a Group Admin.`,
        mentions: [target]
      });
    }
  },
  {
    name: 'antilink',
    aliases: [],
    category: 'group',
    desc: 'Configure Anti-Link protection (off, delete, warn, or kick)',
    usage: '.antilink <off | on | delete | warn | kick>',
    groupOnly: true,
    adminOnly: true,
    react: '🛡️',
    async execute({ m, args }) {
      let mode = (args[0] || '').toLowerCase();
      if (mode === 'on') mode = 'delete';
      if (!['off', 'delete', 'warn', 'kick'].includes(mode)) {
        const current = getGroupConfig(m.chat).antilink;
        return m.reply(
          sciFiCard('ANTI-LINK SHIELD', [
            `📡 *Current:* ${current.toUpperCase()}`,
            `▸ *.antilink delete* — Delete unauthorized links`,
            `▸ *.antilink warn* — Delete + 3-strike auto-kick`,
            `▸ *.antilink kick* — Instant delete & remove`,
            `▸ *.antilink off* — Disable`
          ])
        );
      }
      updateGroupConfig(m.chat, { antilink: mode });
      await m.reply(
        sciFiCard('ANTI-LINK UPDATED', [`🛡️ Mode set to: *${mode.toUpperCase()}*`])
      );
    }
  },
  {
    name: 'antilinkwarn',
    aliases: ['alwarn'],
    category: 'group',
    desc: 'Quickly toggle Anti-Link 3-Strike Warning + Auto-Kick mode',
    usage: '.antilinkwarn <on | off>',
    groupOnly: true,
    adminOnly: true,
    react: '⚠️',
    async execute({ m, args }) {
      const arg = (args[0] || 'on').toLowerCase();
      const enable = !['off', 'false', '0'].includes(arg);
      updateGroupConfig(m.chat, { antilink: enable ? 'warn' : 'off' });
      await m.reply(
        sciFiCard('ANTI-LINK WARN', [
          enable
            ? '⚠️ *ACTIVE:* Links are deleted & members get 3 warnings before auto-kick.'
            : '⚪ *DISABLED:* Anti-Link warning turned off.'
        ])
      );
    }
  },
  {
    name: 'antispam',
    aliases: ['antiflood'],
    category: 'group',
    desc: 'Protect group from rapid message flooding (>6 msgs in 6s)',
    usage: '.antispam <off | on | warn | kick>',
    groupOnly: true,
    adminOnly: true,
    react: '⚡',
    async execute({ m, args }) {
      let mode = (args[0] || '').toLowerCase();
      if (mode === 'on') mode = 'warn';
      if (!['off', 'warn', 'kick'].includes(mode)) {
        const cur = getGroupConfig(m.chat).antispam || 'off';
        return m.reply(
          sciFiCard('ANTI-SPAM SHIELD', [
            `📡 *Current:* ${cur.toUpperCase()}`,
            `▸ *.antispam on* (or *warn*) — Delete flood + 3-strike kick`,
            `▸ *.antispam kick* — Instant kick on flood`,
            `▸ *.antispam off* — Disable`
          ])
        );
      }
      updateGroupConfig(m.chat, { antispam: mode });
      await m.reply(sciFiCard('ANTI-SPAM UPDATED', [`⚡ Anti-Spam set to: *${mode.toUpperCase()}*`]));
    }
  },
  {
    name: 'antistatusmention',
    aliases: ['antistatus', 'antigm'],
    category: 'group',
    desc: 'Block spammers from mentioning/tagging this group in WhatsApp Statuses',
    usage: '.antistatusmention <off | on | delete | warn | kick>',
    groupOnly: true,
    adminOnly: true,
    react: '🚫',
    async execute({ m, args }) {
      let mode = (args[0] || '').toLowerCase();
      if (mode === 'on') mode = 'warn';
      if (!['off', 'delete', 'warn', 'kick'].includes(mode)) {
        const cur = getGroupConfig(m.chat).antistatusmention || 'off';
        return m.reply(
          sciFiCard('ANTI-STATUS MENTION', [
            `📡 *Current:* ${cur.toUpperCase()}`,
            `▸ *.antistatusmention delete* — Delete status-mention spam`,
            `▸ *.antistatusmention warn* — Delete + 3-strike auto-kick`,
            `▸ *.antistatusmention kick* — Instant delete & remove`,
            `▸ *.antistatusmention off* — Disable`
          ])
        );
      }
      updateGroupConfig(m.chat, { antistatusmention: mode });
      await m.reply(
        sciFiCard('ANTI-STATUS MENTION', [`🛡️ Mode set to: *${mode.toUpperCase()}*`])
      );
    }
  },
  {
    name: 'antibadword',
    aliases: ['antitoxic'],
    category: 'group',
    desc: 'Toggle bad-word filter in this group',
    usage: '.antibadword <on | off>',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, args }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(opt)) {
        return m.reply('⚙️ Usage: *.antibadword on* or *.antibadword off*\nManage words with *.addword* / *.delword*');
      }
      updateGroupConfig(m.chat, { antibadword: opt === 'on' });
      await m.reply(`🛡️ Anti-Badword filter is now *${opt.toUpperCase()}*.`);
    }
  },
  {
    name: 'addword',
    aliases: [],
    category: 'group',
    desc: 'Add a word/phrase to the group bad-word filter list',
    usage: '.addword <word>',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, text }) {
      const w = text.trim().toLowerCase();
      if (!w) return m.reply('⚙️ Usage: *.addword <word>*');
      const cfg = getGroupConfig(m.chat);
      if (!cfg.badwords.includes(w)) {
        cfg.badwords.push(w);
        updateGroupConfig(m.chat, { badwords: cfg.badwords });
      }
      await m.reply(`✅ Added *"${w}"* to filtered words (${cfg.badwords.length} total).`);
    }
  },
  {
    name: 'delword',
    aliases: [],
    category: 'group',
    desc: 'Remove a word from the group bad-word filter list',
    usage: '.delword <word>',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, text }) {
      const w = text.trim().toLowerCase();
      if (!w) return m.reply('⚙️ Usage: *.delword <word>*');
      const cfg = getGroupConfig(m.chat);
      const next = cfg.badwords.filter((item) => item !== w);
      updateGroupConfig(m.chat, { badwords: next });
      await m.reply(`🗑️ Removed *"${w}"* from filtered words.`);
    }
  },
  {
    name: 'welcome',
    aliases: [],
    category: 'group',
    desc: 'Toggle automatic welcome messages for new members',
    usage: '.welcome <on | off>',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, args }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(opt)) {
        return m.reply('⚙️ Usage: *.welcome on* or *.welcome off*\nCustomize text with *.setwelcome <message>*');
      }
      updateGroupConfig(m.chat, { welcome: opt === 'on' });
      await m.reply(`👋 Welcome messages are now *${opt.toUpperCase()}*.`);
    }
  },
  {
    name: 'goodbye',
    aliases: ['farewell'],
    category: 'group',
    desc: 'Toggle automatic goodbye messages when members leave',
    usage: '.goodbye <on | off>',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, args }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(opt)) {
        return m.reply('⚙️ Usage: *.goodbye on* or *.goodbye off*');
      }
      updateGroupConfig(m.chat, { goodbye: opt === 'on' });
      await m.reply(`👋 Goodbye messages are now *${opt.toUpperCase()}*.`);
    }
  },
  {
    name: 'setwelcome',
    aliases: [],
    category: 'group',
    desc: 'Customize group welcome template (@user, @group, @count, @desc)',
    usage: '.setwelcome Welcome @user to @group!',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, text }) {
      if (!text) {
        return m.reply('⚙️ Provide template text using placeholders: *@user*, *@group*, *@count*, *@desc*');
      }
      updateGroupConfig(m.chat, { welcomeText: text, welcome: true });
      await m.reply(`✅ Welcome message updated & enabled:\n\n${text}`);
    }
  },
  {
    name: 'setgoodbye',
    aliases: [],
    category: 'group',
    desc: 'Customize group goodbye template (@user, @group, @count)',
    usage: '.setgoodbye Goodbye @user!',
    groupOnly: true,
    adminOnly: true,
    async execute({ m, text }) {
      if (!text) return m.reply('⚙️ Provide template text using *@user*, *@group*, *@count*');
      updateGroupConfig(m.chat, { goodbyeText: text, goodbye: true });
      await m.reply(`✅ Goodbye message updated & enabled:\n\n${text}`);
    }
  },
  {
    name: 'warn',
    aliases: [],
    category: 'group',
    desc: 'Issue a formal warning to a member (3 warnings = automatic kick)',
    usage: '.warn <@user> [reason]',
    groupOnly: true,
    adminOnly: true,
    async execute({ sock, m, args, isBotAdmin }) {
      const target = resolveTargetJid(m, args);
      if (!target) return m.reply('⚙️ Reply to or @mention a user to warn.');
      const num = extractNumber(target) || target;
      const reason = args.filter((a) => !a.startsWith('@')).join(' ') || 'Rule violation';
      const count = addWarning(m.chat, num);

      if (count >= 3 && isBotAdmin) {
        resetWarnings(m.chat, num);
        await sock.sendMessage(m.chat, {
          text: `🚫 *@${extractNumber(target)} reached 3/3 warnings* (${reason}) and has been removed!`,
          mentions: [target]
        });
        await sock.groupParticipantsUpdate(m.chat, [target], 'remove');
      } else {
        await sock.sendMessage(m.chat, {
          text: `⚠️ *WARNING (${count}/3)* for @${extractNumber(target)}\n📝 *Reason:* ${reason}`,
          mentions: [target]
        });
      }
    }
  },
  {
    name: 'resetwarn',
    aliases: ['unwarn'],
    category: 'group',
    desc: 'Clear all warnings for a group member',
    usage: '.resetwarn <@user>',
    groupOnly: true,
    adminOnly: true,
    async execute({ sock, m, args }) {
      const target = resolveTargetJid(m, args);
      if (!target) return m.reply('⚙️ Reply to or @mention a user.');
      resetWarnings(m.chat, extractNumber(target) || target);
      await sock.sendMessage(m.chat, {
        text: `✅ Cleared all warnings for @${extractNumber(target)}.`,
        mentions: [target]
      });
    }
  },
  {
    name: 'warnings',
    aliases: ['checkwarn'],
    category: 'group',
    desc: 'Check warning count of a member',
    usage: '.warnings [@user]',
    groupOnly: true,
    async execute({ sock, m, args }) {
      const target = resolveTargetJid(m, args) || m.sender;
      const count = getWarnings(m.chat, extractNumber(target) || target);
      await sock.sendMessage(m.chat, {
        text: `📋 @${extractNumber(target)} currently has *${count}/3* warnings.`,
        mentions: [target]
      });
    }
  },
  {
    name: 'ginfo',
    aliases: ['groupinfo'],
    category: 'group',
    desc: 'Show full group metadata & active protection shields',
    usage: '.ginfo',
    groupOnly: true,
    async execute({ sock, m, groupMeta }) {
      const meta = groupMeta || (await getGroupMetaSafe(sock, m.chat, true));
      if (!meta) return m.reply('⚠️ Unable to fetch group metadata.');
      const cfg = getGroupConfig(m.chat);
      const admins = (meta.participants || []).filter((p) => p.admin).length;
      const created = meta.creation
        ? new Date(meta.creation * 1000).toLocaleDateString()
        : 'Unknown';

      await m.reply(
        sciFiCard('GROUP TELEMETRY', [
          `🏷️ *Name:* ${meta.subject}`,
          `🆔 *JID:* ${meta.id}`,
          `👥 *Members:* ${meta.participants?.length || 0} (${admins} Admins)`,
          `📅 *Created:* ${created}`,
          `🔒 *Chat Lock:* ${meta.announce ? 'Muted (Admins Only)' : 'Open (Everyone)'}`,
          `🛡️ *Anti-Link:* ${cfg.antilink.toUpperCase()}`,
          `⚡ *Anti-Spam:* ${(cfg.antispam || 'off').toUpperCase()}`,
          `🚫 *Anti-Status:* ${(cfg.antistatusmention || 'off').toUpperCase()}`,
          `🤬 *Anti-Badword:* ${cfg.antibadword ? 'ON' : 'OFF'}`,
          `👋 *Welcome/Goodbye:* ${cfg.welcome ? 'ON' : 'OFF'} / ${cfg.goodbye ? 'ON' : 'OFF'}`,
          `📝 *About:* ${meta.desc || '_None_'}`
        ])
      );
    }
  },
  {
    name: 'setgname',
    aliases: ['setsubject', 'gname'],
    category: 'group',
    desc: 'Update the group name/subject',
    usage: '.setgname <new name>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m, text }) {
      if (!text) return m.reply('⚙️ Usage: *.setgname <new group name>*');
      await sock.groupUpdateSubject(m.chat, text);
      groupCache.del(m.chat);
      await m.reply(`✅ Group name updated to: *${text}*`);
    }
  },
  {
    name: 'gsettings',
    aliases: ['lockinfo', 'groupedit'],
    category: 'group',
    desc: 'Lock or unlock group info editing (subject, icon, description) to Admins only',
    usage: '.gsettings <lock | unlock>',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m, args }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['lock', 'locked', 'unlock', 'unlocked'].includes(opt)) {
        return m.reply('⚙️ Usage: *.gsettings lock* or *.gsettings unlock*');
      }
      const isLock = opt.startsWith('lock');
      await sock.groupSettingUpdate(m.chat, isLock ? 'locked' : 'unlocked');
      groupCache.del(m.chat);
      await m.reply(
        isLock
          ? '🔐 Group info editing locked to *Admins Only*.'
          : '🔓 Group info editing unlocked for *All Members*.'
      );
    }
  },
  {
    name: 'approveall',
    aliases: ['acceptall'],
    category: 'group',
    desc: 'Approve all pending WhatsApp Group Join Requests at once',
    usage: '.approveall',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async execute({ sock, m }) {
      const pending = await sock.groupRequestParticipantsList(m.chat);
      if (!pending?.length) {
        return m.reply('ℹ️ No pending join requests in this group.');
      }
      const jids = pending.map((p) => p.jid);
      await sock.groupRequestParticipantsUpdate(m.chat, jids, 'approve');
      await m.reply(`✅ Approved *${jids.length}* pending group join request(s)!`);
    }
  },
  {
    name: 'poll',
    aliases: [],
    category: 'group',
    desc: 'Create an interactive WhatsApp Poll',
    usage: '.poll Question | Option 1 | Option 2',
    groupOnly: true,
    async execute({ sock, m, text }) {
      const parts = text
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 3) {
        return m.reply('⚙️ Usage: *.poll Best Language? | JavaScript | Python | Rust*');
      }
      const [name, ...values] = parts;
      await sock.sendMessage(m.chat, {
        poll: {
          name,
          values: values.slice(0, 12),
          selectableCount: 1
        }
      });
    }
  }
];
