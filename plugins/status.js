import {
  pushContentToStatus,
  generateBrandedQrPoster,
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
  getSlotConfig,
  updateSlotConfig,
  getStatusAudienceJids,
  registerContactJid
} from '../lib/store.js';
import {
  PUSH_CATEGORIES,
  PUSH_SUBCATEGORIES,
  findSubcategory,
  buildSubcategoryContent,
  dispatchSubcategoryItem
} from '../lib/push-catalog.js';
import { cleanPhoneNumber } from '../lib/env.js';
import { sciFiCard, OFFICIAL_WEB_URL, DEV_SIGNATURE } from '../lib/style.js';

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
  },
  {
    name: 'pushqr',
    aliases: ['qrstatus', 'webqr', 'statusqr', 'shareqr'],
    category: 'status',
    desc: 'Generate a branded Sci-Fi QR Code poster for https://temex-md.onrender.com/ (or any URL) and push it directly to your WhatsApp Status',
    usage: '.pushqr [optional url]',
    ownerOnly: true,
    react: '📲',
    async execute({ sock, m, text }) {
      const targetUrl = (text || '').trim() || OFFICIAL_WEB_URL;
      const posterBuf = await generateBrandedQrPoster(targetUrl);
      const caption =
        `⚡ *𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦* ⚡\n` +
        `📲 *Scan QR or tap below to launch the 3D Web Hub:*\n` +
        `🌐 ${targetUrl}\n\n` +
        `🧠 24/7 AI · 📖 Bible & Prayers · 🎙️ Neural Voice\n` +
        `_${DEV_SIGNATURE}_`;

      const res = await pushContentToStatus(sock, {
        image: posterBuf,
        caption
      });

      await sock.sendMessage(
        m.chat,
        {
          image: posterBuf,
          caption: sciFiCard('QR CODE PUSHED TO STATUS', [
            `✅ Published branded QR poster to your WhatsApp Status!`,
            `🌐 *Link:* ${targetUrl}`,
            `👥 *Synced Audience:* ${res.recipientsCount} contact(s)`
          ])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'pushmenu',
    aliases: ['tickmenu', 'pushlist', 'pushcategories'],
    category: 'status',
    desc: 'Interactive Beginner Tick-Checklist of 24 Status Push Sub-Categories',
    usage: '.pushmenu',
    react: '☑️',
    async execute({ m, prefix, botRuntime }) {
      const slotId = botRuntime?.slotId || 'srv-1';
      const slotCfg = getSlotConfig(slotId);
      const ticked = new Set(slotCfg.tickedSubcategories || []);

      const lines = [
        `🛰️ *Active Server:* ${slotCfg.label}`,
        `🔁 *Auto-Push Schedule:* ${slotCfg.autoPushEnabled ? `ON (every ${slotCfg.autoPushIntervalMins}m)` : 'OFF'}`,
        ``
      ];

      for (const cat of PUSH_CATEGORIES) {
        lines.push(`*━━ ${cat.label.toUpperCase()} ━━*`);
        const subs = PUSH_SUBCATEGORIES.filter((s) => s.categoryId === cat.id);
        for (const s of subs) {
          const mark = ticked.has(s.id) ? '☑️' : '⬜';
          lines.push(`${mark} *[${s.num}]* ${s.title} _(${s.tag})_`);
        }
        lines.push('');
      }

      lines.push(`⚡ *Quick Push Selected Numbers:*`);
      lines.push(`▸ *${prefix}tickpush 1,2,5,21* _(pushes ticked numbers immediately)_`);
      lines.push(`▸ *${prefix}tickpush save 1,2,5,9 120* _(saves ticks & schedules every 120m)_`);
      lines.push(`▸ Or tick visually on Web: ${OFFICIAL_WEB_URL}`);

      await m.reply(sciFiCard('TICK-BOX PUSH SUB-CATEGORIES', lines));
    }
  },
  {
    name: 'tickpush',
    aliases: ['pushtick', 'selectpush'],
    category: 'status',
    desc: 'Push one or multiple ticked sub-category numbers (e.g. .tickpush 1,2,5) or save Auto-Push ticks',
    usage: '.tickpush <1,2,5 | save 1,2,5 [minutes] | off>',
    ownerOnly: true,
    react: '✅',
    async execute({ sock, m, args, text, prefix, botRuntime }) {
      const slotId = botRuntime?.slotId || sock?.slotId || 'srv-1';
      const first = (args[0] || '').toLowerCase();

      if (!first) {
        return m.reply(
          `☑️ Usage:\n` +
            `• *${prefix}pushmenu* — View all 24 numbered sub-categories\n` +
            `• *${prefix}tickpush 1,2,5* — Push sub-categories #1, #2 & #5 now\n` +
            `• *${prefix}tickpush save 1,2,5,13 90* — Auto-push ticked items every 90 mins\n` +
            `• *${prefix}tickpush off* — Pause scheduled tick auto-push`
        );
      }

      if (first === 'off' || first === 'stop') {
        updateSlotConfig(slotId, { autoPushEnabled: false });
        botRuntime?.syncTickAutoPushScheduler?.();
        return m.reply(sciFiCard('TICK AUTO-PUSH PAUSED', [`⏹️ Scheduled sub-category pushing is now OFF on *${slotId.toUpperCase()}*.`]));
      }

      const isSave = first === 'save' || first === 'schedule';
      const rawSelection = isSave ? args[1] || '' : text.split('|')[0] || first;
      const customNote = !isSave && text.includes('|') ? text.split('|').slice(1).join('|').trim() : '';

      const tokens = rawSelection.split(/[\s,]+/).filter(Boolean);
      const chosenSubs = [];
      for (const tok of tokens) {
        const sub = findSubcategory(tok);
        if (sub && !chosenSubs.find((x) => x.id === sub.id)) chosenSubs.push(sub);
      }

      if (chosenSubs.length === 0) {
        return m.reply(`⚠️ No valid sub-category numbers found. Type *${prefix}pushmenu* to see *[1]* through *[24]*.`);
      }

      if (isSave) {
        const mins = Math.max(15, Number(args[2]) || 120);
        updateSlotConfig(slotId, {
          tickedSubcategories: chosenSubs.map((s) => s.id),
          autoPushEnabled: true,
          autoPushIntervalMins: mins
        });
        botRuntime?.syncTickAutoPushScheduler?.();
        return m.reply(
          sciFiCard('TICK SCHEDULE SAVED', [
            `✅ Saved *${chosenSubs.length}* ticked sub-categories on *${slotId.toUpperCase()}*!`,
            `⏱️ *Interval:* Every ${mins} minutes`,
            ...chosenSubs.map((s) => `☑️ [${s.num}] ${s.title}`)
          ])
        );
      }

      await m.reply(`☑️ Pushing *${chosenSubs.length}* selected sub-categor${chosenSubs.length === 1 ? 'y' : 'ies'} smoothly...`);
      const results = [];
      for (const sub of chosenSubs.slice(0, 6)) {
        const built = await buildSubcategoryContent(sub.id, {
          customNote,
          voice: getSlotConfig(slotId).voice || 'andrew',
          webUrl: OFFICIAL_WEB_URL
        });
        const res = await dispatchSubcategoryItem(sock, built, {
          toStatus: true,
          toSelf: false,
          selfJid: m.botJid
        });
        results.push(`☑️ *[${res.num}] ${res.title}* → pushed (${res.recipientsCount} contacts)`);
      }

      await m.reply(sciFiCard('TICK PUSH COMPLETE', results));
    }
  },
  {
    name: 'servers',
    aliases: ['slots', 'botservers', 'openslots'],
    category: 'core',
    desc: 'View all open & occupied Multi-Server Bot Slots so clients/members can grab a free server',
    usage: '.servers',
    react: '🛰️',
    async execute({ m, botRuntime }) {
      const cluster = botRuntime?.cluster;
      if (!cluster) {
        return m.reply(`🛰️ Single-node mode active. Pair at: ${OFFICIAL_WEB_URL}`);
      }
      const ov = cluster.getClusterOverview({ maskNumbers: true });
      const lines = [
        `🟢 *Connected Servers:* ${ov.connectedCount} / ${ov.totalServers}`,
        `🟡 *Free Open Servers:* ${ov.freeCount} available right now!`,
        ``
      ];
      for (const s of ov.servers.slice(0, 12)) {
        const badge =
          s.status === 'connected'
            ? `🟢 OCCUPIED (${s.user?.maskedNumber || 'Online'})`
            : `🟡 FREE — OPEN TO GRAB`;
        lines.push(`• *${s.slotId.toUpperCase()}* — ${badge}`);
      }
      lines.push(``, `🌐 *Claim a Free Server:* ${OFFICIAL_WEB_URL}`);
      await m.reply(sciFiCard('NEXUS MULTI-SERVER CLUSTER', lines));
    }
  }
];
