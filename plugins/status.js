import {
  pushContentToStatus,
  generateMotivationContent,
  generateQuoteContent,
  generatePsychologyContent,
  generateBibleContent,
  generateSpiritualContent,
  generatePrayerContent,
  syncAutoStatusScheduler
} from '../lib/status-poster.js';
import {
  updateSettings,
  getStatusAudienceJids,
  registerContactJid
} from '../lib/store.js';
import { cleanPhoneNumber } from '../lib/env.js';
import { sciFiCard } from '../lib/style.js';

export default [
  {
    name: 'pushstatus',
    aliases: ['tostatus', 'poststatus', 'upstatus', 'statuspush', 'cdstatus', 'setstatus'],
    category: 'status',
    desc: 'Push any replied media/text — or auto-generated bible/prayer/motivate/psych/quote — directly to your WhatsApp Status',
    usage: '.pushstatus [text | bible | prayer | motivate | psych | quote] (or reply to image/video/audio)',
    ownerOnly: true,
    react: '📡',
    async execute({ sock, m, args, text }) {
      const src = m.quoted || m;
      const firstArg = (args[0] || '').toLowerCase();
      const restTopic = args.slice(1).join(' ').trim();

      // 1. Media push (Image / Video / Audio)
      if (['imageMessage', 'videoMessage', 'audioMessage'].includes(src.mtype)) {
        const buf = await src.download();
        const caption = text || src.text || '';
        let res;
        if (src.mtype === 'imageMessage') {
          res = await pushContentToStatus(sock, { image: buf, caption });
        } else if (src.mtype === 'videoMessage') {
          res = await pushContentToStatus(sock, { video: buf, caption });
        } else {
          res = await pushContentToStatus(sock, {
            audio: buf,
            mimetype: src.content?.mimetype || 'audio/mp4',
            ptt: true
          });
        }
        return m.reply(
          sciFiCard('PUSHED TO STATUS', [
            `✅ Media published to your WhatsApp Status!`,
            `👥 *Synced Audience:* ${res.recipientsCount} contact(s)`
          ])
        );
      }

      // 2. Smart category generators (.pushstatus bible / prayer / motivate / psych / quote / spiritual)
      let statusText = '';
      if (['bible', 'verse', 'scripture'].includes(firstArg)) {
        statusText = await generateBibleContent(restTopic);
      } else if (['prayer', 'pray'].includes(firstArg)) {
        statusText = await generatePrayerContent(restTopic);
      } else if (['motivate', 'motivation'].includes(firstArg)) {
        statusText = await generateMotivationContent(restTopic);
      } else if (['psych', 'psychology', 'pyschology'].includes(firstArg)) {
        statusText = await generatePsychologyContent(restTopic);
      } else if (['quote', 'quotes'].includes(firstArg)) {
        statusText = await generateQuoteContent(restTopic);
      } else if (['spiritual', 'devo'].includes(firstArg)) {
        statusText = await generateSpiritualContent(restTopic);
      } else {
        statusText = text || m.quoted?.text || '';
      }

      if (!statusText) {
        return m.reply(
          sciFiCard('PUSH TO STATUS HELP', [
            `📡 *Reply to any photo, video, audio, or text* with *.pushstatus*`,
            `▸ *.pushstatus <your custom text>*`,
            `▸ *.pushstatus bible [John 3:16]*`,
            `▸ *.pushstatus prayer [family]*`,
            `▸ *.pushstatus motivate [hustle]*`,
            `▸ *.pushstatus psych [confidence]*`,
            `▸ *.pushstatus quote*`
          ])
        );
      }

      const res = await pushContentToStatus(sock, { text: statusText });
      await m.reply(
        sciFiCard('STATUS PUBLISHED', [
          `✅ Successfully pushed to your WhatsApp Status!`,
          `👥 *Synced Audience:* ${res.recipientsCount} contact(s)`,
          `📝 *Preview:*`,
          statusText
        ])
      );
    }
  },
  {
    name: 'pushbible',
    aliases: ['statusbible'],
    category: 'status',
    desc: 'Generate a Bible verse and immediately push it to your WhatsApp Status',
    usage: '.pushbible [Psalm 23 | topic]',
    ownerOnly: true,
    react: '📖',
    async execute({ sock, m, text }) {
      const content = await generateBibleContent(text);
      const res = await pushContentToStatus(sock, { text: content });
      await m.reply(
        sciFiCard('BIBLE PUSHED TO STATUS', [
          `👥 *Audience:* ${res.recipientsCount} contact(s)`,
          content
        ])
      );
    }
  },
  {
    name: 'pushprayer',
    aliases: ['statusprayer'],
    category: 'status',
    desc: 'Generate an uplifting Prayer and immediately push it to your WhatsApp Status',
    usage: '.pushprayer [optional intention]',
    ownerOnly: true,
    react: '🙏',
    async execute({ sock, m, text }) {
      const content = await generatePrayerContent(text);
      const res = await pushContentToStatus(sock, { text: content });
      await m.reply(
        sciFiCard('PRAYER PUSHED TO STATUS', [
          `👥 *Audience:* ${res.recipientsCount} contact(s)`,
          content
        ])
      );
    }
  },
  {
    name: 'pushmotivate',
    aliases: ['statusmotivate'],
    category: 'status',
    desc: 'Generate daily Motivation and immediately push it to your WhatsApp Status',
    usage: '.pushmotivate [optional topic]',
    ownerOnly: true,
    react: '🔥',
    async execute({ sock, m, text }) {
      const content = await generateMotivationContent(text);
      const res = await pushContentToStatus(sock, { text: content });
      await m.reply(
        sciFiCard('MOTIVATION PUSHED TO STATUS', [
          `👥 *Audience:* ${res.recipientsCount} contact(s)`,
          content
        ])
      );
    }
  },
  {
    name: 'pushpsych',
    aliases: ['statuspsych'],
    category: 'status',
    desc: 'Generate a Psychology insight and immediately push it to your WhatsApp Status',
    usage: '.pushpsych [optional topic]',
    ownerOnly: true,
    react: '🧠',
    async execute({ sock, m, text }) {
      const content = await generatePsychologyContent(text);
      const res = await pushContentToStatus(sock, { text: content });
      await m.reply(
        sciFiCard('PSYCHOLOGY PUSHED TO STATUS', [
          `👥 *Audience:* ${res.recipientsCount} contact(s)`,
          content
        ])
      );
    }
  },
  {
    name: 'pushquote',
    aliases: ['statusquote'],
    category: 'status',
    desc: 'Fetch an inspiring Quote and immediately push it to your WhatsApp Status',
    usage: '.pushquote [optional topic]',
    ownerOnly: true,
    react: '💡',
    async execute({ sock, m, text }) {
      const content = await generateQuoteContent(text);
      const res = await pushContentToStatus(sock, { text: content });
      await m.reply(
        sciFiCard('QUOTE PUSHED TO STATUS', [
          `👥 *Audience:* ${res.recipientsCount} contact(s)`,
          content
        ])
      );
    }
  },
  {
    name: 'autostatuspush',
    aliases: ['autopushstatus', 'autostatuspost'],
    category: 'status',
    desc: 'Schedule automatic WhatsApp Status posts (mix, bible, prayer, motivation, psychology, quote)',
    usage: '.autostatuspush <on | off> [minutes] [mix | bible | prayer | motivation | psychology | quote]',
    ownerOnly: true,
    react: '⏱️',
    async execute({ m, args, settings, botRuntime }) {
      const toggle = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(toggle)) {
        const cur = settings.autoStatusPush || {};
        return m.reply(
          sciFiCard('AUTO STATUS PUSH', [
            `📡 *Current:* ${cur.enabled ? `ON (every ${cur.intervalMinutes}m · ${cur.category})` : 'OFF'}`,
            `▸ *.autostatuspush on 120 mix* — Post every 2h`,
            `▸ *.autostatuspush on 180 bible* — Bible verses every 3h`,
            `▸ *.autostatuspush on 180 prayer* — Prayers every 3h`,
            `▸ *.autostatuspush on 120 motivation* — Motivation every 2h`,
            `▸ *.autostatuspush off* — Disable`
          ])
        );
      }

      if (toggle === 'off') {
        updateSettings({
          autoStatusPush: { ...(settings.autoStatusPush || {}), enabled: false }
        });
        syncAutoStatusScheduler(() => botRuntime?.sock);
        return m.reply('⚪ *Auto-Status Push disabled.*');
      }

      const mins = Math.max(15, Number.parseInt(args[1] || '180', 10) || 180);
      const cat = (args[2] || 'mix').toLowerCase();
      const validCats = ['mix', 'motivation', 'quote', 'psychology', 'bible', 'prayer'];
      const chosenCat = validCats.includes(cat) ? cat : 'mix';

      updateSettings({
        autoStatusPush: {
          enabled: true,
          intervalMinutes: mins,
          category: chosenCat
        }
      });
      syncAutoStatusScheduler(() => botRuntime?.sock);

      await m.reply(
        sciFiCard('AUTO STATUS PUSH ENABLED', [
          `✅ Posting *${chosenCat.toUpperCase()}* to WhatsApp Status every *${mins} minutes*!`
        ])
      );
    }
  },
  {
    name: 'statusaudience',
    aliases: ['statuscontacts', 'addstatuscontact'],
    category: 'status',
    desc: 'Check synced Status recipient count or add a phone number to receive Status pushes',
    usage: '.statusaudience [optional phone number to add]',
    ownerOnly: true,
    async execute({ m, args }) {
      if (args[0]) {
        const num = cleanPhoneNumber(args[0]);
        if (num) registerContactJid(`${num}@s.whatsapp.net`);
      }
      const list = getStatusAudienceJids(m.botJid);
      await m.reply(
        sciFiCard('STATUS AUDIENCE', [
          `👥 *Synced Recipients:* ${list.length} contact JID(s)`,
          `💡 Contacts are automatically learned from your chats & groups, or add manually via *.statusaudience 2547XXXXXXXX*`
        ])
      );
    }
  }
];
