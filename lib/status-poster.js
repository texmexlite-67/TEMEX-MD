import axios from 'axios';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { askTexmexAi } from './ai.js';
import { getStatusAudienceJids, getSettings } from './store.js';
import { logger } from './logger.js';
import {
  extractTopicalScriptureFromSites,
  generateSpecializedPrayer,
  PRAYER_CATEGORIES
} from './prayer-engine.js';

const STATUS_BG_COLORS = [
  '#070d12', // Obsidian Cyber Dark
  '#063b27', // Deep Emerald Matrix
  '#111827', // Midnight Slate
  '#1e1b4b', // Deep Indigo Cosmos
  '#3b0764', // Royal Cyber Violet
  '#451a03'  // Warm Amber Bronze
];

export const CURATED_MOTIVATION = [
  '🔥 Discipline is choosing between what you want NOW and what you want MOST. Keep building in silence — your consistency will make the noise.',
  '⚡ Every master was once a beginner who refused to quit on an ordinary Tuesday. Show up today even at 60%, because 60% beats 0% every single time.',
  '🚀 Stop waiting for perfect conditions. Ships weren’t built to stay safe in the harbor — launch, adapt, and grow stronger through the waves.',
  '💎 Small daily upgrades compound into unrecognizable breakthroughs. Protect your focus, guard your mornings, and execute relentlessly.',
  '🦁 Your future self is watching you right now through your memories. Make decisions today that your future self will thank you for.',
  '🏔️ Hard seasons don’t come to break you — they come to forge capacity, resilience, and clarity you couldn’t gain in comfort.'
];

export const CURATED_PSYCHOLOGY = [
  '🧠 *Zeigarnik Effect:* Your brain remembers unfinished tasks 2x more vividly than completed ones. Feeling overwhelmed? Write down every open loop — externalizing tasks immediately lowers cognitive anxiety.',
  '🧠 *Spotlight Effect:* People notice your mistakes far less than you think — everyone is busy worrying about their own spotlight. Walk with boldness.',
  '🧠 *Habit Loop Science:* Willpower fades by evening, automatic cues don’t. Attach a new habit directly after an existing daily anchor ("After my morning tea, I read 3 pages").',
  '🧠 *Cognitive Reframing:* Anxiety and excitement produce almost identical physiological signals (elevated heart rate, alertness). Telling yourself "I am energized and ready" outperforms "calm down".',
  '🧠 *Pygmalion Effect:* High expectations subtly elevate performance — both in how you treat others and the identity you speak over yourself.',
  '🧠 *2-Minute Action Rule:* Motivation rarely precedes action; action creates dopamine which fuels motivation. Commit to just 120 seconds of starting.'
];

export const CURATED_BIBLE_VERSES = [
  { ref: 'Philippians 4:13', text: 'I can do all things through Christ who strengthens me.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the LORD, plans for welfare and not for evil, to give you a future and a hope.' },
  { ref: 'Isaiah 41:10', text: 'Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you, I will uphold you with my righteous right hand.' },
  { ref: 'Psalm 23:1-4', text: 'The LORD is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.' },
  { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.' },
  { ref: 'Joshua 1:9', text: 'Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go.' },
  { ref: 'Romans 8:28', text: 'And we know that for all things God works for the good of those who love him, who have been called according to his purpose.' },
  { ref: 'Psalm 91:1-2', text: 'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty. I will say to the LORD, "My refuge and my fortress, my God, in whom I trust."' }
];

export const CURATED_SPIRITUAL = [
  '✨ *Daily Spiritual Reflection:*\nPeace is not the absence of storms, but the awareness of God’s presence inside the boat. Release what you cannot control today, walk in integrity, and extend grace freely.',
  '🕊️ *Soul Renewal:*\nBefore rushing into the demands of the world, anchor your spirit in gratitude. When your heart is rooted in thankfulness, fear loses its grip.',
  '🌿 *Faith Over Fear:*\nDelayed answers are often divine preparation. Keep sowing seeds of kindness, diligence, and prayer — harvest season always arrives on God’s timetable.',
  '🕯️ *Light in the Journey:*\nYou don’t need to see the entire staircase to take the next faithful step. Trust that grace will meet you at every turn today.'
];

export const CURATED_PRAYERS = [
  '🙏 *Prayer for Strength, Peace & Guidance:*\nHeavenly Father, thank You for the gift of life and new mercies today. Grant me wisdom in every decision, peace that guards my heart and mind, protection over my loved ones, and favor in the work of my hands. Lead my steps and let my life reflect Your light and love. In Jesus’ name, Amen.',
  '🙏 *Prayer of Protection & Breakthrough:*\nLord Almighty, You are my refuge and fortress. Cover my family, health, and endeavors under Your wings today. Open doors that no one can shut, silence every anxious thought, and fill our home with joy, provision, and steadfast faith. Amen.',
  '🙏 *Prayer of Gratitude & Grace:*\nGracious God, thank You for carrying me through unseen battles and blessing me beyond measure. Renew my strength where I feel weary, forgive my shortcomings, and empower me to be a blessing to everyone I encounter today. Amen.'
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateMotivationContent(topic = '') {
  if (topic) {
    try {
      const res = await askTexmexAi(
        `Write a powerful, punchy, deeply inspiring motivational message (4-6 lines max) specifically about: "${topic}". Include 1-2 fitting emojis.`,
        { systemPrompt: 'You are an elite high-performance motivational speaker and mindset coach.' }
      );
      if (res) return res;
    } catch {
      // fallback to curated
    }
  }
  return pickRandom(CURATED_MOTIVATION);
}

export async function generateQuoteContent(topic = '') {
  if (topic) {
    try {
      const res = await askTexmexAi(
        `Share 2 authentic, profound quotes with author attributions about: "${topic}".`,
        { systemPrompt: 'You are a literary and philosophical quote curator.' }
      );
      if (res) return res;
    } catch {
      // fallback
    }
  }

  try {
    const { data } = await axios.get('https://zenquotes.io/api/random', { timeout: 7000 });
    if (data?.[0]?.q) {
      return `💡 _"${data[0].q}"_\n\n— *${data[0].a || 'Unknown'}*`;
    }
  } catch {
    // fallback
  }

  try {
    const { data } = await axios.get('https://dummyjson.com/quotes/random', { timeout: 7000 });
    if (data?.quote) {
      return `💡 _"${data.quote}"_\n\n— *${data.author || 'Unknown'}*`;
    }
  } catch {
    // fallback
  }

  return `💡 _"We are what we repeatedly do. Excellence, then, is not an act, but a habit."_\n\n— *Aristotle*`;
}

export async function generatePsychologyContent(topic = '') {
  if (topic) {
    try {
      const res = await askTexmexAi(
        `Explain the psychology behind "${topic}" with 1 fascinating scientific/behavioral insight and 2 practical actionable takeaways. Keep it concise and clear for WhatsApp.`,
        { systemPrompt: 'You are a warm, insightful behavioral psychologist and cognitive science communicator.' }
      );
      if (res) return res;
    } catch {
      // fallback
    }
  }
  return pickRandom(CURATED_PSYCHOLOGY);
}

export async function generateBibleContent(refOrTopic = '') {
  const input = String(refOrTopic || '').trim();

  // Check if input looks like a Bible reference (e.g. "John 3:16", "Psalm 23", "1 Cor 13:4-7")
  if (input && /\d/.test(input)) {
    try {
      const { data } = await axios.get(
        `https://bible-api.com/${encodeURIComponent(input)}`,
        { timeout: 10000 }
      );
      if (data?.text && data?.reference) {
        return `📖 *${data.reference}* (${(data.translation_id || 'WEB').toUpperCase()})\n\n_"${data.text.trim()}"_`;
      }
    } catch {
      // Fall through to AI scripture lookup
    }
  }

  // Topic search via OpenBible.info Topical Concordance + AI reflection
  if (input) {
    const topical = await extractTopicalScriptureFromSites(input, []);
    try {
      const prompt = topical
        ? `Based on this extracted Bible verse for "${input}": "${topical.text}" (${topical.reference}), add 1 more matching Bible verse (Book Chapter:Verse + text) and a 2-sentence uplifting reflection.`
        : `Provide 2 comforting, accurate Bible verses (with Book Chapter:Verse reference and full verse text) about "${input}", followed by a 2-sentence uplifting reflection.`;
      const res = await askTexmexAi(prompt, {
        systemPrompt: 'You are a knowledgeable, encouraging Biblical scholar and devotional writer.'
      });
      if (topical && res) {
        return `📖 *${topical.reference}*\n_"${topical.text}"_\n\n${res}\n\n_📚 Extracted via ${topical.source} · TEXMEX-MD AI_`;
      }
      if (res) return res;
    } catch {
      if (topical) {
        return `📖 *${topical.reference}*\n\n_"${topical.text}"_\n\n_📚 Extracted via ${topical.source}_`;
      }
    }
  }

  // Daily Verse via BibleGateway VOTD -> Curated fallback
  const votd = await extractTopicalScriptureFromSites('', []);
  if (votd) {
    return `📖 *${votd.reference}*\n\n_"${votd.text}"_\n\n_📚 Extracted via ${votd.source}_`;
  }

  const pick = pickRandom(CURATED_BIBLE_VERSES);
  return `📖 *${pick.ref}*\n\n_"${pick.text}"_`;
}

export async function generateSpiritualContent(topic = '') {
  if (topic) {
    try {
      const res = await askTexmexAi(
        `Write a short, uplifting daily spiritual devotional (Scripture verse + 3-4 sentence reflection + 1 practical faith step) centered on: "${topic}".`,
        { systemPrompt: 'You are a compassionate spiritual mentor and devotional author.' }
      );
      if (res) return res;
    } catch {
      // fallback
    }
  }
  return pickRandom(CURATED_SPIRITUAL);
}

export async function generatePrayerContent(intention = '') {
  const raw = String(intention || '').trim();
  if (!raw) {
    const keys = Object.keys(PRAYER_CATEGORIES);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return generateSpecializedPrayer(randomKey, '');
  }
  const parts = raw.split(/\s+/);
  const firstWord = parts[0] || '';
  const rest = parts.slice(1).join(' ').trim();
  return generateSpecializedPrayer(firstWord, rest);
}

/**
 * Push text, image, video, or audio directly onto the linked WhatsApp Status (status@broadcast).
 */
export async function pushContentToStatus(sock, payload = {}) {
  if (!sock?.user?.id) {
    throw new Error('WhatsApp socket is not connected yet.');
  }
  const botJid = jidNormalizedUser(sock.user.id);
  const statusJidList = getStatusAudienceJids(botJid);

  if (payload.image) {
    await sock.sendMessage(
      'status@broadcast',
      { image: payload.image, caption: payload.caption || '' },
      { statusJidList }
    );
  } else if (payload.video) {
    await sock.sendMessage(
      'status@broadcast',
      { video: payload.video, caption: payload.caption || '' },
      { statusJidList }
    );
  } else if (payload.audio) {
    await sock.sendMessage(
      'status@broadcast',
      {
        audio: payload.audio,
        mimetype: payload.mimetype || 'audio/mp4',
        ptt: payload.ptt !== false
      },
      { statusJidList }
    );
  } else if (payload.text) {
    const bgColor = payload.backgroundColor || pickRandom(STATUS_BG_COLORS);
    await sock.sendMessage(
      'status@broadcast',
      { text: payload.text },
      {
        backgroundColor: bgColor,
        font: 1,
        statusJidList
      }
    );
  } else {
    throw new Error('Nothing provided to push to WhatsApp Status.');
  }

  return { recipientsCount: statusJidList.length };
}

let autoStatusTimer = null;

/**
 * Start or refresh the scheduled Auto-Push-to-Status background loop.
 */
export function syncAutoStatusScheduler(getSockFn) {
  if (autoStatusTimer) {
    clearInterval(autoStatusTimer);
    autoStatusTimer = null;
  }

  const cfg = getSettings().autoStatusPush;
  if (!cfg?.enabled) return;

  const mins = Math.max(15, Number(cfg.intervalMinutes) || 180);
  const categories = ['motivation', 'quote', 'psychology', 'bible', 'prayer'];

  autoStatusTimer = setInterval(async () => {
    try {
      const sock = getSockFn?.();
      if (!sock?.user?.id) return;
      const chosen =
        cfg.category && cfg.category !== 'mix'
          ? cfg.category
          : pickRandom(categories);

      let text = '';
      if (chosen === 'motivation') text = await generateMotivationContent();
      else if (chosen === 'quote') text = await generateQuoteContent();
      else if (chosen === 'psychology') text = await generatePsychologyContent();
      else if (chosen === 'bible') text = await generateBibleContent();
      else if (chosen === 'prayer') text = await generatePrayerContent();
      else text = await generateMotivationContent();

      const res = await pushContentToStatus(sock, {
        text: `${text}\n\n⚡ TEXMEX-MD`
      });
      logger.success(
        'STATUS-PUSH',
        `Auto-pushed ${chosen.toUpperCase()} status to ${res.recipientsCount} contacts`
      );
    } catch (err) {
      logger.warn('STATUS-PUSH', `Auto status push skipped: ${err.message}`);
    }
  }, mins * 60 * 1000);

  if (typeof autoStatusTimer.unref === 'function') autoStatusTimer.unref();
}
