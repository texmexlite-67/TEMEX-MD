import {
  pushContentToStatus,
  generateBrandedQrPoster,
  generateMotivationContent,
  generateQuoteContent,
  generatePsychologyContent,
  generateBibleContent,
  generateSpiritualContent
} from './status-poster.js';
import { generateSpecializedPrayer } from './prayer-engine.js';
import { generateSpeechAudio } from './tts.js';
import { askTexmexAi } from './ai.js';
import { DEV_SIGNATURE, OFFICIAL_WEB_URL } from './style.js';

export const PUSH_CATEGORIES = [
  {
    id: 'faith',
    label: 'Faith, Bible & Prayers',
    badge: 'FAITH',
    desc: 'Scripture promises, morning/night blessings, and exam/family prayers.'
  },
  {
    id: 'motivation',
    label: 'Motivation & Hustle',
    badge: 'HUSTLE',
    desc: 'Discipline, entrepreneurship, resilience, and smart growth.'
  },
  {
    id: 'mind',
    label: 'Psychology & Wisdom',
    badge: 'MIND',
    desc: 'Cognitive science insights, confidence habits, and Stoic quotes.'
  },
  {
    id: 'voice',
    label: 'AI Neural Voice Status',
    badge: 'VOICE',
    desc: 'Spoken HD neural voice notes ready for WhatsApp Status & DM.'
  },
  {
    id: 'fun',
    label: 'Fun, Tech & Good Vibes',
    badge: 'VIBES',
    desc: 'Future tech facts, clean humor, anime wisdom, and friendly check-ins.'
  },
  {
    id: 'promo',
    label: 'Business, QR & Client Invite',
    badge: 'PROMO',
    desc: 'Branded QR invite posters, open server notices, and client greetings.'
  }
];

export const PUSH_SUBCATEGORIES = [
  // 1. FAITH, BIBLE & PRAYERS
  {
    id: 'bible_promise',
    num: 1,
    categoryId: 'faith',
    title: 'Daily Bible Promise & Verse',
    kind: 'text',
    tag: 'SCRIPTURE',
    starter: true,
    desc: 'Uplifting Scripture verse with chapter/verse reference and short reflection.'
  },
  {
    id: 'morning_prayer',
    num: 2,
    categoryId: 'faith',
    title: 'Morning Grace & Guidance Prayer',
    kind: 'text',
    tag: 'PRAYER',
    starter: true,
    desc: 'Warm morning blessing for peace, favor, wisdom, and divine direction.'
  },
  {
    id: 'exam_success_prayer',
    num: 3,
    categoryId: 'faith',
    title: 'Exam, Study & Breakthrough Prayer',
    kind: 'text',
    tag: 'PRAYER',
    starter: false,
    desc: 'Focused prayer for students, interviews, memory recall, and career doors.'
  },
  {
    id: 'family_night_prayer',
    num: 4,
    categoryId: 'faith',
    title: 'Family Protection & Night Rest',
    kind: 'text',
    tag: 'PRAYER',
    starter: false,
    desc: 'Evening shield of peace and protection over family, home, and loved ones.'
  },

  // 2. MOTIVATION & HUSTLE
  {
    id: 'morning_discipline',
    num: 5,
    categoryId: 'motivation',
    title: '5 AM Discipline & Focus Fuel',
    kind: 'text',
    tag: 'DISCIPLINE',
    starter: true,
    desc: 'High-energy reminder to lock in, eliminate distractions, and execute today.'
  },
  {
    id: 'entrepreneur_hustle',
    num: 6,
    categoryId: 'motivation',
    title: 'Entrepreneur & Builder Mindset',
    kind: 'text',
    tag: 'BUSINESS',
    starter: false,
    desc: 'Sharp mindset fuel for founders, creators, side-hustlers, and builders.'
  },
  {
    id: 'resilience_comeback',
    num: 7,
    categoryId: 'motivation',
    title: 'Resilience & Comeback Strength',
    kind: 'text',
    tag: 'GRIT',
    starter: false,
    desc: 'Encouragement for turning setbacks and tough seasons into breakthroughs.'
  },
  {
    id: 'wealth_habits',
    num: 8,
    categoryId: 'motivation',
    title: 'Smart Money & Daily Compounding',
    kind: 'text',
    tag: 'GROWTH',
    starter: false,
    desc: 'Practical daily wealth, skill-building, and financial discipline insight.'
  },

  // 3. PSYCHOLOGY & WISDOM
  {
    id: 'cognitive_bias',
    num: 9,
    categoryId: 'mind',
    title: 'Brain & Behavioral Psychology Fact',
    kind: 'text',
    tag: 'PSYCHOLOGY',
    starter: true,
    desc: 'Fascinating psychology effect (Zeigarnik, Habit Loop, Dopamine) + takeaway.'
  },
  {
    id: 'confidence_social',
    num: 10,
    categoryId: 'mind',
    title: 'Confidence & Calm Presence Tip',
    kind: 'text',
    tag: 'CONFIDENCE',
    starter: false,
    desc: 'Actionable communication and self-assurance psychology for daily life.'
  },
  {
    id: 'stoic_quote',
    num: 11,
    categoryId: 'mind',
    title: 'Timeless Stoic & Leadership Quote',
    kind: 'text',
    tag: 'QUOTE',
    starter: false,
    desc: 'Verified wisdom from classic thinkers, leaders, and philosophers.'
  },
  {
    id: 'spiritual_reflection',
    num: 12,
    categoryId: 'mind',
    title: 'Peaceful Soul & Gratitude Check-In',
    kind: 'text',
    tag: 'MINDFUL',
    starter: false,
    desc: 'Calm 60-second reflection to reset stress and anchor your heart in gratitude.'
  },

  // 4. AI NEURAL VOICE STATUS
  {
    id: 'voice_motivation',
    num: 13,
    categoryId: 'voice',
    title: 'Spoken AI Voice: Daily Fire Boost',
    kind: 'audio',
    tag: 'HD VOICE',
    starter: false,
    desc: 'Generates a neural voice note speaking punchy motivation directly on Status.'
  },
  {
    id: 'voice_prayer',
    num: 14,
    categoryId: 'voice',
    title: 'Spoken AI Voice: Blessing Prayer',
    kind: 'audio',
    tag: 'HD VOICE',
    starter: false,
    desc: 'Generates a warm spoken blessing prayer audio note for WhatsApp Status.'
  },
  {
    id: 'voice_bible',
    num: 15,
    categoryId: 'voice',
    title: 'Spoken AI Voice: Audio Scripture',
    kind: 'audio',
    tag: 'HD VOICE',
    starter: false,
    desc: 'Reads a powerful Bible verse aloud with neural voice clarity.'
  },
  {
    id: 'voice_psych',
    num: 16,
    categoryId: 'voice',
    title: 'Spoken AI Voice: Mind Hack',
    kind: 'audio',
    tag: 'HD VOICE',
    starter: false,
    desc: 'Short spoken psychology insight delivered as a crisp WhatsApp voice status.'
  },

  // 5. FUN, TECH & GOOD VIBES
  {
    id: 'tech_ai_fact',
    num: 17,
    categoryId: 'fun',
    title: 'Mind-Blowing AI & Tech Fact',
    kind: 'text',
    tag: 'TECH',
    starter: false,
    desc: 'Short, shareable fact about AI, space, cybersecurity, or modern engineering.'
  },
  {
    id: 'clean_humor',
    num: 18,
    categoryId: 'fun',
    title: 'Clean Witty Joke / Status Icebreaker',
    kind: 'text',
    tag: 'HUMOR',
    starter: false,
    desc: 'Lighthearted, clean clever joke to make your WhatsApp contacts smile.'
  },
  {
    id: 'anime_wisdom',
    num: 19,
    categoryId: 'fun',
    title: 'Iconic Anime Quote & Determination',
    kind: 'text',
    tag: 'ANIME',
    starter: false,
    desc: 'Hard-hitting quote inspired by classic anime determination and loyalty.'
  },
  {
    id: 'good_vibes_checkin',
    num: 20,
    categoryId: 'fun',
    title: 'Friendly Good Vibes Check-In',
    kind: 'text',
    tag: 'SOCIAL',
    starter: false,
    desc: 'Warm, relatable status check-in wishing your contacts a winning day.'
  },

  // 6. BUSINESS, QR & CLIENT INVITE
  {
    id: 'bot_invite_qr',
    num: 21,
    categoryId: 'promo',
    title: 'Branded NEXUS Server Invite QR Poster',
    kind: 'image_qr',
    tag: 'HD POSTER',
    starter: false,
    desc: 'Pushes a 1080x1350 sci-fi QR poster so friends/clients can grab an open bot server!'
  },
  {
    id: 'open_servers_notice',
    num: 22,
    categoryId: 'promo',
    title: 'Open Bot Servers Available Notice',
    kind: 'text',
    tag: 'INVITE',
    starter: false,
    desc: 'Announces that free multi-device bot server slots are open for members to pair.'
  },
  {
    id: 'business_morning',
    num: 23,
    categoryId: 'promo',
    title: 'Good Morning Clients & Partners',
    kind: 'text',
    tag: 'CLIENT CARE',
    starter: false,
    desc: 'Polished professional status greeting letting clients know you are open & active.'
  },
  {
    id: 'gratitude_milestone',
    num: 24,
    categoryId: 'promo',
    title: 'Customer & Community Appreciation',
    kind: 'text',
    tag: 'THANK YOU',
    starter: false,
    desc: 'Warm appreciation status thanking supporters, clients, and contacts.'
  }
];

const CURATED_TECH_FACTS = [
  '⚡ *Tech Insight:* Over 90% of global internet traffic travels through undersea fiber-optic cables thinner than a garden hose — carrying petabits of light across oceans at ~200,000 km/s.',
  '🤖 *AI Evolution:* Modern neural speech & transformer models process context across thousands of dimensions in milliseconds — turning plain prompts into full symphonies, code, and automation.',
  '🛰️ *Space Engineering:* GPS satellites orbit at 14,000 km/h and must correct their atomic clocks by 38 microseconds per day due to Einstein’s relativity — otherwise Google Maps would drift by 10 km daily!'
];

const CURATED_CLEAN_JOKES = [
  '😄 *Status Break:* Why do programmers always mix up Halloween and Christmas?\nBecause *Oct 31 == Dec 25*! 💻✨',
  '😂 *Quick Smile:* My Wi-Fi went down for five minutes today, so I had to talk to my family. They seem like really nice people!',
  '😄 *Tech Humor:* A SQL query walks into a restaurant, walks up to two tables, and asks: *"Can I JOIN you?"*'
];

const CURATED_ANIME_QUOTES = [
  '🔥 *"Hard work is worthless for those that don’t believe in themselves."* — *Naruto Uzumaki*\n\nKeep betting on your growth today.',
  '⚔️ *"Set your heart ablaze. Go beyond your limits!"* — *Kyojuro Rengoku*\n\nMove with courage and zero hesitation.',
  '🌊 *"No matter how deep the night, it always turns to day, eventually."* — *Brook (One Piece)*\n\nStay steady — your breakthrough is closer than it feels.'
];

export function findSubcategory(idOrNum) {
  if (idOrNum === undefined || idOrNum === null) return null;
  const s = String(idOrNum).trim().toLowerCase();
  const asNum = Number(s);
  if (Number.isInteger(asNum) && asNum >= 1) {
    return PUSH_SUBCATEGORIES.find((x) => x.num === asNum) || null;
  }
  return PUSH_SUBCATEGORIES.find((x) => x.id === s) || null;
}

/**
 * Generate the text/audio/image payload for a single tickable sub-category.
 */
export async function buildSubcategoryContent(subId, { customNote = '', voice = 'andrew', webUrl = OFFICIAL_WEB_URL } = {}) {
  const sub = findSubcategory(subId);
  if (!sub) throw new Error(`Unknown push sub-category: ${subId}`);

  const note = String(customNote || '').trim();

  if (sub.id === 'bot_invite_qr') {
    const targetUrl = note && /^https?:\/\//i.test(note) ? note : webUrl || OFFICIAL_WEB_URL;
    const imageBuf = await generateBrandedQrPoster(targetUrl);
    const caption =
      `⚡ *𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗡𝗘𝗫𝗨𝗦 𝗖𝗢𝗠𝗠* ⚡\n` +
      `🛰️ *Multiple Free WhatsApp Bot Servers Are Open!*\n` +
      `📲 Scan QR or open:\n🌐 ${targetUrl}\n\n` +
      `✅ Grab your own server slot · 8-Digit Pairing · 165+ Commands · AI Phonk Studio\n` +
      `_${DEV_SIGNATURE}_`;
    return { sub, kind: 'image', image: imageBuf, caption, previewText: caption };
  }

  let text = '';
  switch (sub.id) {
    case 'bible_promise':
      text = await generateBibleContent(note);
      break;
    case 'morning_prayer':
      text = await generateSpecializedPrayer('motivational', note || 'a blessed, productive morning');
      break;
    case 'exam_success_prayer':
      text = await generateSpecializedPrayer('exam', note || 'exams, studies, and career breakthrough');
      break;
    case 'family_night_prayer':
      text = await generateSpecializedPrayer('family', note || 'peaceful protection over family and home');
      break;
    case 'morning_discipline':
      text = await generateMotivationContent(note || 'morning discipline, focus, and zero excuses');
      break;
    case 'entrepreneur_hustle':
      text = await generateMotivationContent(note || 'entrepreneurship, building in silence, and execution');
      break;
    case 'resilience_comeback':
      text = await generateMotivationContent(note || 'resilience, bouncing back stronger after setbacks');
      break;
    case 'wealth_habits':
      text = await generateMotivationContent(note || 'financial wisdom, compounding skills, and smart work');
      break;
    case 'cognitive_bias':
      text = await generatePsychologyContent(note);
      break;
    case 'confidence_social':
      text = await generatePsychologyContent(note || 'calm self-confidence and strong presence');
      break;
    case 'stoic_quote':
      text = await generateQuoteContent(note || 'stoic discipline and wisdom');
      break;
    case 'spiritual_reflection':
      text = await generateSpiritualContent(note || 'gratitude and inner peace');
      break;
    case 'voice_motivation': {
      const script = await generateMotivationContent(note || 'discipline and winning today');
      const tts = await generateSpeechAudio(script, { voice, preferOpusPtt: true });
      return {
        sub,
        kind: 'audio',
        audio: tts.buffer,
        mp3Buffer: tts.mp3Buffer,
        mimetype: tts.mimetype === 'audio/mpeg' ? 'audio/mp4' : tts.mimetype,
        previewText: `🎙️ [AI Voice · ${tts.voiceLabel}] ${script}`
      };
    }
    case 'voice_prayer': {
      const script = await generateSpecializedPrayer('self', note || 'peace, strength, and favor today');
      const tts = await generateSpeechAudio(script, { voice, preferOpusPtt: true });
      return {
        sub,
        kind: 'audio',
        audio: tts.buffer,
        mp3Buffer: tts.mp3Buffer,
        mimetype: tts.mimetype === 'audio/mpeg' ? 'audio/mp4' : tts.mimetype,
        previewText: `🎙️ [AI Voice · ${tts.voiceLabel}] ${script}`
      };
    }
    case 'voice_bible': {
      const script = await generateBibleContent(note);
      const tts = await generateSpeechAudio(script, { voice, preferOpusPtt: true });
      return {
        sub,
        kind: 'audio',
        audio: tts.buffer,
        mp3Buffer: tts.mp3Buffer,
        mimetype: tts.mimetype === 'audio/mpeg' ? 'audio/mp4' : tts.mimetype,
        previewText: `🎙️ [AI Voice · ${tts.voiceLabel}] ${script}`
      };
    }
    case 'voice_psych': {
      const script = await generatePsychologyContent(note);
      const tts = await generateSpeechAudio(script, { voice, preferOpusPtt: true });
      return {
        sub,
        kind: 'audio',
        audio: tts.buffer,
        mp3Buffer: tts.mp3Buffer,
        mimetype: tts.mimetype === 'audio/mpeg' ? 'audio/mp4' : tts.mimetype,
        previewText: `🎙️ [AI Voice · ${tts.voiceLabel}] ${script}`
      };
    }
    case 'tech_ai_fact':
      if (note) {
        text = await askTexmexAi(`Share 1 fascinating, accurate 3-sentence tech/science fact about "${note}" with 1-2 emojis.`, {
          systemPrompt: 'You are a crisp science & technology communicator.'
        }).catch(() => '');
      }
      if (!text) text = CURATED_TECH_FACTS[Math.floor(Math.random() * CURATED_TECH_FACTS.length)];
      break;
    case 'clean_humor':
      if (note) {
        text = await askTexmexAi(`Tell 1 short, clean, genuinely witty joke about "${note}" suitable for WhatsApp Status.`, {
          systemPrompt: 'You are a clever, family-friendly comedian.'
        }).catch(() => '');
      }
      if (!text) text = CURATED_CLEAN_JOKES[Math.floor(Math.random() * CURATED_CLEAN_JOKES.length)];
      break;
    case 'anime_wisdom':
      text = CURATED_ANIME_QUOTES[Math.floor(Math.random() * CURATED_ANIME_QUOTES.length)];
      break;
    case 'good_vibes_checkin':
      text =
        `✨ *Good Vibes Check-In*\n\n` +
        (note
          ? `${note}\n\n`
          : `Wishing everyone reading this a calm mind, productive hands, unexpected good news, and genuine wins today. Keep shining! 🌟`);
      break;
    case 'open_servers_notice':
      text =
        `🛰️ *𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗢𝗣𝗘𝗡 𝗕𝗢𝗧 𝗦𝗘𝗥𝗩𝗘𝗥𝗦* ⚡\n\n` +
        `Want your own 24/7 Multi-Device WhatsApp Bot without logging anyone else out?\n` +
        `✅ Grab an open Server Slot (` + `SRV-02 … SRV-10+` + `)\n` +
        `🔑 Instant 8-Digit Pairing Code (200+ Countries)\n` +
        `🎵 160s+ AI Phonk Studio · 📖 Bible & Prayers · 📥 YouTube DL\n\n` +
        `🌐 Pair now: ${webUrl || OFFICIAL_WEB_URL}`;
      break;
    case 'business_morning':
      text =
        `💼 *Good Morning & Happy New Day!*\n\n` +
        (note
          ? `${note}\n\n`
          : `We are online, active, and ready to serve you today! Send a DM anytime for inquiries, orders, or support — prompt, reliable service guaranteed. 🤝✨`);
      break;
    case 'gratitude_milestone':
      text =
        `🙏 *Appreciation Note*\n\n` +
        (note
          ? `${note}\n\n`
          : `A huge thank you to every client, friend, and supporter in my corner. Your trust, referrals, and encouragement mean everything. Wishing you abundant success! 💛`);
      break;
    default:
      text = await generateMotivationContent(note);
  }

  return {
    sub,
    kind: 'text',
    text: `${text}\n\n_⚡ TEXMEX-MD_`,
    previewText: text
  };
}

/**
 * Push a generated subcategory item to WhatsApp Status and/or Self DM on a given Baileys socket.
 */
export async function dispatchSubcategoryItem(sock, built, { toStatus = true, toSelf = false, selfJid = '' } = {}) {
  let recipientsCount = 0;

  if (toStatus) {
    if (built.kind === 'image') {
      const r = await pushContentToStatus(sock, { image: built.image, caption: built.caption });
      recipientsCount = r.recipientsCount;
    } else if (built.kind === 'audio') {
      const r = await pushContentToStatus(sock, {
        audio: built.audio,
        mimetype: built.mimetype,
        ptt: true
      });
      recipientsCount = r.recipientsCount;
    } else {
      const r = await pushContentToStatus(sock, { text: built.text });
      recipientsCount = r.recipientsCount;
    }
  }

  if (toSelf && selfJid) {
    if (built.kind === 'image') {
      await sock.sendMessage(selfJid, { image: built.image, caption: built.caption }).catch(() => {});
    } else if (built.kind === 'audio') {
      await sock
        .sendMessage(selfJid, {
          audio: built.mp3Buffer || built.audio,
          mimetype: built.mp3Buffer ? 'audio/mpeg' : built.mimetype,
          ptt: false
        })
        .catch(() => {});
    } else {
      await sock.sendMessage(selfJid, { text: built.text }).catch(() => {});
    }
  }

  return {
    id: built.sub.id,
    num: built.sub.num,
    title: built.sub.title,
    kind: built.kind,
    recipientsCount,
    preview: built.previewText
  };
}
