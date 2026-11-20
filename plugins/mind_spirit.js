import { askTexmexAi } from '../lib/ai.js';
import {
  generateMotivationContent,
  generateQuoteContent,
  generatePsychologyContent,
  generateBibleContent,
  generateSpiritualContent
} from '../lib/status-poster.js';
import {
  generateSpecializedPrayer,
  resolvePrayerCategoryKey
} from '../lib/prayer-engine.js';
import { sendReadyVoiceToChat } from '../lib/tts.js';
import { sciFiCard } from '../lib/style.js';
import { logger } from '../lib/logger.js';

const AFFIRMATIONS = [
  '🌟 I am disciplined, focused, and capable of achieving extraordinary results today.',
  '💎 Challenges sharpen my mind and strengthen my character. I rise above every obstacle.',
  '⚡ My peace is non-negotiable, my vision is clear, and my daily actions align with my purpose.',
  '🌿 I attract wisdom, healthy opportunities, and genuine growth into my life every day.',
  '🦁 Courage flows through me. I execute boldly without fear of imperfection.'
];

async function replyCardAndAutoVoice(sock, m, settings, cardTitle, spokenBody, extraLines = []) {
  await m.reply(sciFiCard(cardTitle, [spokenBody, ...extraLines]));
  if (settings?.autoVoice !== false) {
    try {
      await sendReadyVoiceToChat(sock, m.chat, spokenBody, {
        quoted: m.raw,
        voice: settings?.ttsVoice || 'andrew',
        title: cardTitle
      });
    } catch (err) {
      logger.warn('AUTOVOICE', `Auto TTS skipped: ${err.message}`);
    }
  }
}

function makePrayerCommand({ name, aliases, key, cardTitle, desc, usage, react }) {
  return {
    name,
    aliases,
    category: 'mind',
    desc,
    usage,
    react,
    async execute({ sock, m, text, settings }) {
      const note = text || m.quoted?.text || '';
      const content = await generateSpecializedPrayer(key, note);
      await replyCardAndAutoVoice(sock, m, settings, cardTitle, content);
    }
  };
}

export default [
  {
    name: 'motivate',
    aliases: ['motivation', 'hustle', 'grind', 'boost'],
    category: 'mind',
    desc: 'Get high-impact daily motivation + auto AI voice ready for listening',
    usage: '.motivate [topic / goal]',
    react: '🔥',
    async execute({ sock, m, text, settings }) {
      const content = await generateMotivationContent(text);
      await replyCardAndAutoVoice(sock, m, settings, 'DAILY MOTIVATION', content);
    }
  },
  {
    name: 'quote',
    aliases: ['quotes', 'inspire', 'wisdom', 'stoic'],
    category: 'mind',
    desc: 'Receive an inspiring philosophical or leadership quote + auto AI voice',
    usage: '.quote [topic]',
    react: '💡',
    async execute({ sock, m, text, settings }) {
      const content = await generateQuoteContent(text);
      await replyCardAndAutoVoice(sock, m, settings, 'WISDOM QUOTE', content);
    }
  },
  {
    name: 'psychology',
    aliases: ['pyschology', 'psych', 'psyfact', 'mindfact', 'humanbehavior'],
    category: 'mind',
    desc: 'Explore human psychology insights, cognitive biases, & behavioral science + auto AI voice',
    usage: '.psychology [topic, e.g. habits / confidence / anxiety]',
    react: '🧠',
    async execute({ sock, m, text, settings }) {
      const content = await generatePsychologyContent(text);
      await replyCardAndAutoVoice(sock, m, settings, 'PSYCHOLOGY INSIGHT', content);
    }
  },
  {
    name: 'affirm',
    aliases: ['affirmation', 'mindset'],
    category: 'mind',
    desc: 'Receive a powerful daily mindset affirmation + auto AI voice',
    usage: '.affirm',
    react: '🌟',
    async execute({ sock, m, settings }) {
      const pick = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
      await replyCardAndAutoVoice(sock, m, settings, 'MINDSET AFFIRMATION', pick);
    }
  },
  {
    name: 'advice',
    aliases: ['counsel', 'lifetip'],
    category: 'mind',
    desc: 'Get thoughtful psychological & practical life advice + auto AI voice',
    usage: '.advice [describe situation]',
    react: '🧭',
    async execute({ sock, m, text, settings }) {
      const situation = text || m.quoted?.text;
      if (!situation) {
        const generic = await askTexmexAi(
          'Share 1 timeless, practical piece of psychological & life advice in 3-4 concise sentences.',
          { systemPrompt: 'You are a wise, empathetic counselor and behavioral coach.' }
        );
        return replyCardAndAutoVoice(sock, m, settings, 'LIFE COUNSEL', generic);
      }
      const res = await askTexmexAi(
        `Give empathetic, grounded, psychologically sound advice (4-6 lines) for this situation: "${situation}"`,
        { systemPrompt: 'You are a wise, empathetic counselor and behavioral psychologist.' }
      );
      await replyCardAndAutoVoice(sock, m, settings, 'PSYCHOLOGICAL COUNSEL', res);
    }
  },
  {
    name: 'bible',
    aliases: ['verse', 'scripture', 'votd', 'kjv'],
    category: 'mind',
    desc: 'Extract Bible verses by passage/topic + auto AI Neural TTS audio ready for listening',
    usage: '.bible [John 3:16 | Psalm 23 | prosperity | peace]',
    react: '📖',
    async execute({ sock, m, text, settings }) {
      const content = await generateBibleContent(text || m.quoted?.text || '');
      await replyCardAndAutoVoice(sock, m, settings, 'HOLY SCRIPTURE', content);
    }
  },
  {
    name: 'spiritual',
    aliases: ['devotional', 'devo', 'soul', 'faith', 'word'],
    category: 'mind',
    desc: 'Receive an uplifting daily spiritual devotional + auto AI voice',
    usage: '.spiritual [optional theme, e.g. gratitude / patience]',
    react: '🕊️',
    async execute({ sock, m, text, settings }) {
      const content = await generateSpiritualContent(text);
      await replyCardAndAutoVoice(sock, m, settings, 'SPIRITUAL DEVOTIONAL', content);
    }
  },
  {
    name: 'prayer',
    aliases: ['pray', 'amen', 'blessing', 'morningprayer', 'nightprayer', 'prayers'],
    category: 'mind',
    desc: 'Scripture-extracted AI prayer hub + auto AI Neural TTS voice ready for listening',
    usage: '.prayer [list | exam | travel | prosperity | family | friends | self | group | motivational | success | failure | custom]',
    react: '🙏',
    async execute({ sock, m, args, text, cmdName, settings }) {
      const p = settings.prefix || '.';
      const first = (args[0] || '').toLowerCase();

      if (first === 'list' || cmdName === 'prayers') {
        return m.reply(
          sciFiCard('BIBLE-EXTRACTED PRAYER HUB', [
            `🙏 *Specialized Scripture + AI Prayers (with Auto Voice):*`,
            `▸ *${p}examprayer* — Exam wisdom, calm nerves & recall`,
            `▸ *${p}travelprayer* — Safe travel & journey mercies`,
            `▸ *${p}prosperityprayer* — Provision, stewardship & open doors`,
            `▸ *${p}familyprayer* — Family protection, health & unity`,
            `▸ *${p}friendsprayer* — Loyal friendships & circle blessing`,
            `▸ *${p}selfprayer* — Personal renewal, peace & clarity`,
            `▸ *${p}groupprayer* — Group harmony & collective blessing`,
            `▸ *${p}motivationalprayer* — Strength, grit & courage`,
            `▸ *${p}successprayer* — Career/project favor & breakthrough`,
            `▸ *${p}failureprayer* — Rising from setback, grace & comeback`,
            `\n🎙️ _Auto-Voice is active! Toggle via *${p}autovoice off* or change narrator via *${p}setvoice*._`
          ])
        );
      }

      if (!text && cmdName === 'morningprayer') {
        const content = await generateSpecializedPrayer(
          'motivational',
          'a blessed, productive, protected morning and new day'
        );
        return replyCardAndAutoVoice(sock, m, settings, 'MORNING PRAYER', content);
      }
      if (!text && cmdName === 'nightprayer') {
        const content = await generateSpecializedPrayer(
          'self',
          'peaceful rest, gratitude for today, and overnight protection'
        );
        return replyCardAndAutoVoice(sock, m, settings, 'NIGHT PRAYER', content);
      }

      const mapped = resolvePrayerCategoryKey(first);
      let content;
      if (mapped) {
        content = await generateSpecializedPrayer(mapped, args.slice(1).join(' ').trim());
      } else if (text || m.quoted?.text) {
        content = await generateSpecializedPrayer('', text || m.quoted?.text);
      } else {
        content = await generateSpecializedPrayer('self', '');
      }

      await replyCardAndAutoVoice(sock, m, settings, 'PRAYER & SCRIPTURE', content, [
        `\n💡 _Send *${p}prayers* to view all 10 specialized prayers._`
      ]);
    }
  },

  makePrayerCommand({
    name: 'examprayer',
    aliases: ['prayerexam', 'studyprayer', 'testprayer'],
    key: 'exam',
    cardTitle: 'EXAM PRAYER',
    desc: 'Bible-extracted prayer for exams, memory recall, & calm nerves + AI Voice',
    usage: '.examprayer [optional subject / exam name]',
    react: '📝'
  }),
  makePrayerCommand({
    name: 'travelprayer',
    aliases: ['journeyprayer', 'safetravel', 'tripprayer'],
    key: 'travel',
    cardTitle: 'TRAVEL PRAYER',
    desc: 'Bible-extracted prayer for safe travel & journey mercies + AI Voice',
    usage: '.travelprayer [optional destination / trip]',
    react: '✈️'
  }),
  makePrayerCommand({
    name: 'prosperityprayer',
    aliases: ['wealthprayer', 'abundanceprayer', 'provisionprayer', 'financesprayer'],
    key: 'prosperity',
    cardTitle: 'PROSPERITY PRAYER',
    desc: 'Bible-extracted prayer for godly prosperity & open doors + AI Voice',
    usage: '.prosperityprayer [optional work / business goal]',
    react: '🌾'
  }),
  makePrayerCommand({
    name: 'familyprayer',
    aliases: ['homeprayer', 'householdprayer', 'parentsprayer'],
    key: 'family',
    cardTitle: 'FAMILY PRAYER',
    desc: 'Bible-extracted prayer for family protection, health, & unity + AI Voice',
    usage: '.familyprayer [optional family members / need]',
    react: '🏡'
  }),
  makePrayerCommand({
    name: 'friendsprayer',
    aliases: ['friendprayer', 'friendshipprayer', 'gangprayer'],
    key: 'friends',
    cardTitle: 'FRIENDS PRAYER',
    desc: 'Bible-extracted prayer for true friends & mutual growth + AI Voice',
    usage: '.friendsprayer [optional friend name]',
    react: '🤝'
  }),
  makePrayerCommand({
    name: 'selfprayer',
    aliases: ['personalprayer', 'myprayer', 'innerprayer'],
    key: 'self',
    cardTitle: 'SELF PRAYER',
    desc: 'Bible-extracted personal prayer for inner peace & renewal + AI Voice',
    usage: '.selfprayer [optional personal focus]',
    react: '🕊️'
  }),
  makePrayerCommand({
    name: 'groupprayer',
    aliases: ['corporateprayer', 'teamprayer', 'communityprayer', 'bazeprayer'],
    key: 'group',
    cardTitle: 'GROUP PRAYER',
    desc: 'Bible-extracted prayer for group unity & collective blessing + AI Voice',
    usage: '.groupprayer [optional group / team name]',
    react: '👥'
  }),
  makePrayerCommand({
    name: 'motivationalprayer',
    aliases: ['motivateprayer', 'strengthprayer', 'courageprayer'],
    key: 'motivational',
    cardTitle: 'MOTIVATIONAL PRAYER',
    desc: 'Bible-extracted motivational prayer for strength & grit + AI Voice',
    usage: '.motivationalprayer [optional challenge / goal]',
    react: '🔥'
  }),
  makePrayerCommand({
    name: 'successprayer',
    aliases: ['victoryprayer', 'breakthroughprayer', 'careerprayer'],
    key: 'success',
    cardTitle: 'SUCCESS PRAYER',
    desc: 'Bible-extracted prayer for success, favor, & breakthrough + AI Voice',
    usage: '.successprayer [optional project / career goal]',
    react: '🏆'
  }),
  makePrayerCommand({
    name: 'failureprayer',
    aliases: ['setbackprayer', 'recoveryprayer', 'comebackprayer', 'restorationprayer'],
    key: 'failure',
    cardTitle: 'OVERCOMING FAILURE PRAYER',
    desc: 'Bible-extracted prayer for healing after failure & comeback + AI Voice',
    usage: '.failureprayer [optional setback / situation]',
    react: '🌅'
  })
];
