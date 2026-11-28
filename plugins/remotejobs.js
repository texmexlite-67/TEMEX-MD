import {
  PLATFORMS,
  TOP_PICKS,
  SCAM_RED_FLAGS,
  VETTING_STEPS,
  KENYA_NOTES,
  RESEARCH_DATE,
  DISCLAIMER
} from '../lib/remote-jobs-data.js';

const divider = '━━━━━━━━━━━━━━━━━━';

function fitCard(lines) {
  return lines.filter(Boolean).join('\n');
}

export default [
  {
    name: 'remotejobs',
    aliases: ['aijobs', 'onlinejobs', 'taskjobs'],
    category: 'jobs',
    desc: 'Legit remote AI & online tasking jobs overview (researched Nov 2026)',
    usage: '.remotejobs [kenya]',
    react: '💼',
    async execute({ m, args }) {
      const wantsKenya = (args[0] || '').toLowerCase() === 'kenya';
      const top = TOP_PICKS.map((id) => PLATFORMS.find((p) => p.id === id)).filter(Boolean);

      const lines = [
        '💼 *LEGIT REMOTE AI & TASKING JOBS*',
        `📅 Researched ${RESEARCH_DATE} · Global focus`,
        divider,
        '*Top verified picks:*',
        ...top.map(
          (p, i) =>
            `\n*${i + 1}. ${p.name}*\n├ *Pay:* ${p.pay}\n├ *Payout:* ${p.payouts}\n└ *Best for:* ${p.bestFor}`
        ),
        '',
        divider,
        `📋 *${PLATFORMS.length} platforms profiled.* Use *.jobinfo <name>* (e.g. *.jobinfo appen*) for full details, or *.jobinfo list* to see all.`,
        '🛡️ *.taskscam* → spot fake "online tasking" scams (never pay to work!).',
        ...(wantsKenya ? ['', divider, '🇰🇪 *KENYA NOTES*', ...KENYA_NOTES.map((n) => `▸ ${n}`)] : ['', '💡 Kenyans: *.remotejobs kenya* for local notes.']),
        '',
        `_${DISCLAIMER}_`
      ];

      await m.reply(fitCard(lines));
    }
  },
  {
    name: 'jobinfo',
    aliases: ['job', 'jobdetail'],
    category: 'jobs',
    desc: 'Full card for one legit remote job platform — .jobinfo <name>',
    usage: '.jobinfo <platform|list>',
    react: '🔎',
    async execute({ m, args, text }) {
      const query = (text || '').trim().toLowerCase();

      if (!query || query === 'list' || query === 'all') {
        const list = PLATFORMS.map((p) => `▸ *${p.id}* — ${p.name}`).join('\n');
        return m.reply(
          `📋 *ALL ${PLATFORMS.length} PROFILED PLATFORMS*\n${divider}\n${list}\n\n` +
            `Usage: *.jobinfo <name>* (e.g. *.jobinfo dataannotation*)\n_${DISCLAIMER}_`
        );
      }

      const platform =
        PLATFORMS.find((p) => p.id === query) ||
        PLATFORMS.find((p) => p.name.toLowerCase().includes(query)) ||
        PLATFORMS.find((p) => p.id.includes(query));

      if (!platform) {
        const suggestions = PLATFORMS.map((p) => p.id).join(', ');
        return m.reply(
          `⚠️ No platform matches *"${query}"*.\n\nAvailable: ${suggestions}\n\nTip: *.jobinfo list*`
        );
      }

      const lines = [
        `💼 *${platform.name}*`,
        `${divider}`,
        `🏷️ *Type:* ${platform.type}`,
        `💰 *Pay:* ${platform.pay}`,
        `💳 *Payout:* ${platform.payouts}`,
        `🌍 *Eligibility:* ${platform.eligibility}`,
        `🎯 *Best for:* ${platform.bestFor}`,
        `📝 *Notes:* ${platform.notes}`,
        `✅ *Status:* ${platform.legit}`,
        `🔗 *Apply ONLY here:* ${platform.url}`,
        `${divider}`,
        `_${DISCLAIMER}_`
      ];

      await m.reply(fitCard(lines));
    }
  },
  {
    name: 'taskscam',
    aliases: ['jobscam', 'scamcheck', 'remotescam'],
    category: 'jobs',
    desc: 'Spot fake "online tasking" scams + how to vet any remote job offer',
    usage: '.taskscam',
    react: '🛡️',
    async execute({ m }) {
      const lines = [
        '🛡️ *IS IT A JOB OR A TASK SCAM?*',
        '_Real employers pay YOU. They never ask YOU to pay to work._',
        divider,
        '*🚩 Red flags — walk away if you see these:*',
        ...SCAM_RED_FLAGS.map((f, i) => `${i + 1}. ${f}`),
        '',
        '*✅ How to vet any remote offer (60 seconds):*',
        ...VETTING_STEPS.map((s, i) => `${i + 1}. ${s}`),
        '',
        divider,
        '💡 *Golden rule:* if money must flow FROM you TO them — it is not a job.',
        '💡 Legit picks: *.remotejobs* · platform details: *.jobinfo <name>*',
        `_Last researched ${RESEARCH_DATE}. Stay safe!_`
      ];

      await m.reply(fitCard(lines));
    }
  }
];
