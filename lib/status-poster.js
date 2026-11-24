import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import QRCode from 'qrcode';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { askTexmexAi } from './ai.js';
import { getSharp, OFFICIAL_WEB_URL } from './env.js';
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
  const statusJidList = getStatusAudienceJids(botJid, sock.slotId || 'srv-1');

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

/**
 * Generate a 1080x1350 Sci-Fi Branded QR Code Poster PNG for WhatsApp Status & Sharing.
 */
export async function generateBrandedQrPoster(targetUrl = OFFICIAL_WEB_URL) {
  const url = String(targetUrl || OFFICIAL_WEB_URL).trim();
  const displayUrl = url.replace(/^https?:\/\//i, '');

  // High error correction ('H' = 30%) so center emblem scans instantaneously on all phone cameras
  const rawQrBuf = await QRCode.toBuffer(url, {
    type: 'png',
    width: 580,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#05131d',
      light: '#ffffff'
    }
  });

  const sharp = await getSharp();
  if (!sharp) {
    return rawQrBuf;
  }

  const width = 1080;
  const height = 1350;
  const safeDisplay = url
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 48);

  const bgSvg = Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#040a10"/>
        <stop offset="50%" stop-color="#071b26"/>
        <stop offset="100%" stop-color="#04080e"/>
      </linearGradient>
      <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00f5a0"/>
        <stop offset="100%" stop-color="#00d9f5"/>
      </linearGradient>
      <radialGradient id="glowCenter" cx="50%" cy="46%" r="45%">
        <stop offset="0%" stop-color="#00f5a0" stop-opacity="0.22"/>
        <stop offset="60%" stop-color="#00d9f5" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#00f5a0" stroke-opacity="0.06" stroke-width="1"/>
      </pattern>
    </defs>

    <!-- Deep Cyber Background + Grid + Glow -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
    <rect width="${width}" height="${height}" fill="url(#grid)"/>
    <rect width="${width}" height="${height}" fill="url(#glowCenter)"/>

    <!-- Outer HUD Frame -->
    <rect x="44" y="44" width="992" height="1262" rx="36" fill="none" stroke="url(#neonGrad)" stroke-opacity="0.32" stroke-width="2"/>
    <path d="M 44 128 L 44 76 Q 44 44 76 44 L 128 44" fill="none" stroke="#00f5a0" stroke-width="6" stroke-linecap="round"/>
    <path d="M 952 44 L 1004 44 Q 1036 44 1036 76 L 1036 128" fill="none" stroke="#00d9f5" stroke-width="6" stroke-linecap="round"/>
    <path d="M 44 1222 L 44 1274 Q 44 1306 76 1306 L 128 1306" fill="none" stroke="#00d9f5" stroke-width="6" stroke-linecap="round"/>
    <path d="M 952 1306 L 1004 1306 Q 1036 1306 1036 1274 L 1036 1222" fill="none" stroke="#00f5a0" stroke-width="6" stroke-linecap="round"/>

    <!-- Top Pill Badge -->
    <rect x="290" y="96" width="500" height="46" rx="23" fill="#062834" stroke="url(#neonGrad)" stroke-width="2"/>
    <text x="540" y="126" text-anchor="middle" fill="#00f5a0" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="bold" letter-spacing="3">SCAN TO OPEN 3D WEB HUB</text>

    <!-- Main Brand Header -->
    <text x="540" y="206" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="56" font-weight="bold" letter-spacing="2">TEXMEX-MD // 3D NEXUS</text>
    <text x="540" y="252" text-anchor="middle" fill="#8be9fd" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="22" font-weight="bold" letter-spacing="2">24/7 AI  ·  BIBLE &amp; PRAYERS  ·  NEURAL VOICE  ·  BOT HUB</text>

    <!-- White QR Card Container + Neon Border -->
    <rect x="206" y="296" width="668" height="668" rx="44" fill="#06222e" stroke="url(#neonGrad)" stroke-width="5"/>
    <rect x="220" y="310" width="640" height="640" rx="34" fill="#ffffff"/>

    <!-- URL Highlight Pill -->
    <rect x="120" y="1024" width="840" height="84" rx="42" fill="#072532" stroke="url(#neonGrad)" stroke-width="3"/>
    <text x="540" y="1075" text-anchor="middle" fill="#00f5a0" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="28" font-weight="bold">${safeDisplay}</text>

    <!-- Feature Strip & Signature -->
    <text x="540" y="1166" text-anchor="middle" fill="#cbd5e1" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="22" font-weight="bold" letter-spacing="1.5">OPEN ON ANY PHONE OR COMPUTER  ·  158+ COMMANDS</text>
    <line x1="220" y1="1206" x2="860" y2="1206" stroke="#00f5a0" stroke-opacity="0.25" stroke-width="1.5"/>
    <text x="540" y="1254" text-anchor="middle" fill="#94a3b8" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="21" font-weight="bold">Developed by TEXMEX with ♥  ·  github.com/texmexlite-67/TEMEX-MD</text>
  </svg>
  `);

  const composites = [
    { input: rawQrBuf, left: 250, top: 340 }
  ];

  // Add subtle rounded center Bot DP emblem inside protective white shield
  const dpThumbPath = path.join(process.cwd(), 'public', 'bot-dp-thumb.jpg');
  if (fs.existsSync(dpThumbPath)) {
    try {
      const shieldSvg = Buffer.from(
        `<svg width="116" height="116" xmlns="http://www.w3.org/2000/svg">` +
          `<rect x="2" y="2" width="112" height="112" rx="26" fill="#ffffff" stroke="#00f5a0" stroke-width="4"/>` +
        `</svg>`
      );
      const maskSvg = Buffer.from(
        `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">` +
          `<rect x="0" y="0" width="96" height="96" rx="20" fill="#ffffff"/>` +
        `</svg>`
      );
      const roundedDp = await sharp(dpThumbPath)
        .resize(96, 96, { fit: 'cover' })
        .composite([{ input: maskSvg, blend: 'dest-in' }])
        .png()
        .toBuffer();

      composites.push({ input: shieldSvg, left: 482, top: 572 });
      composites.push({ input: roundedDp, left: 492, top: 582 });
    } catch {
      // keep clean QR if avatar overlay fails
    }
  }

  return sharp(bgSvg).composite(composites).png({ compressionLevel: 8 }).toBuffer();
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
        text: `${text}\n\n⚡ TEXMEX-MD · 🌐 https://temex-md.onrender.com/`
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
