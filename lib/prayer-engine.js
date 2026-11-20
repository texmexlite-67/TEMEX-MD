import axios from 'axios';
import { askTexmexAi } from './ai.js';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 10 Specialized Prayer Blueprints with OpenBible topical slugs,
 * canonical anchor passages, prayer focus, and rich offline Biblical fallbacks.
 */
export const PRAYER_CATEGORIES = {
  exam: {
    key: 'exam',
    title: 'EXAM & ACADEMIC WISDOM PRAYER',
    emoji: '📝',
    openBibleTopics: ['exams', 'studying', 'wisdom'],
    anchorRefs: ['James 1:5', '2 Timothy 2:15', 'Philippians 4:6-7', 'Daniel 1:17'],
    focus:
      'clarity of mind, sharp memory recall, calm nerves free from exam anxiety, divine wisdom, and academic excellence',
    fallbackVerse: {
      reference: 'James 1:5 (ESV)',
      text: 'If any of you lacks wisdom, let him ask God, who gives generously to all without reproach, and it will be given him.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Heavenly Father, Fountain of all wisdom and understanding, calm my heart and silence every wave of exam anxiety. Sharpen my memory to recall everything I have studied clearly and accurately. Grant me discernment, focus, and steady confidence from start to finish. May the work of my mind bring honor and excellence today. Amen.'
  },
  travel: {
    key: 'travel',
    title: 'SAFE TRAVEL & JOURNEY MERCIES PRAYER',
    emoji: '✈️',
    openBibleTopics: ['safe_travel', 'traveling', 'protection'],
    anchorRefs: ['Psalm 121:7-8', 'Psalm 91:11', 'Proverbs 3:23', 'Isaiah 43:2'],
    focus:
      'journey mercies, angelic protection on roads/skies/waters, alert drivers and pilots, peaceful transit, and safe arrival',
    fallbackVerse: {
      reference: 'Psalm 121:8 (NKJV)',
      text: 'The LORD shall preserve your going out and your coming in from this time forth, and even forevermore.',
      source: 'Bolls.life / NKJV'
    },
    fallbackPrayer:
      'Lord our Protector, we place this entire journey into Your mighty hands. Go before us on every road, highway, and flight path; surround our vehicle and fellow travelers with Your angels. Shield us from every hazard, mechanical fault, or delay, and bring us safely to our destination and back in peace and joy. Amen.'
  },
  prosperity: {
    key: 'prosperity',
    title: 'PROSPERITY, PROVISION & STEWARDSHIP PRAYER',
    emoji: '🌾',
    openBibleTopics: ['prosperity', 'financial_blessing', 'provision'],
    anchorRefs: ['Deuteronomy 8:18', 'Philippians 4:19', '3 John 1:2', 'Psalm 1:3'],
    focus:
      'godly prosperity, fruitful labor, open doors of opportunity, financial wisdom, debt freedom, and generous overflow',
    fallbackVerse: {
      reference: '3 John 1:2 (NKJV)',
      text: 'Beloved, I pray that you may prosper in all things and be in health, just as your soul prospers.',
      source: 'BibleGateway / NKJV'
    },
    fallbackPrayer:
      'Jehovah Jireh, our faithful Provider, bless the diligent work of our hands and grant us creative ideas, wise stewardship, and open doors that no one can shut. Supply every need according to Your glorious riches, remove lack and stagnation, and make us a channel of generosity and blessing to many. Amen.'
  },
  family: {
    key: 'family',
    title: 'FAMILY PROTECTION, UNITY & PEACE PRAYER',
    emoji: '🏡',
    openBibleTopics: ['family', 'family_unity', 'blessing_children'],
    anchorRefs: ['Joshua 24:15', 'Numbers 6:24-26', 'Psalm 128:1-3', 'Colossians 3:14'],
    focus:
      'deep love, forgiveness, health, protection, provision, and unshakeable unity across every member of the family and household',
    fallbackVerse: {
      reference: 'Joshua 24:15 (ESV)',
      text: 'But as for me and my house, we will serve the LORD.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Gracious Father, cover every member of my family near and far under the shelter of Your wings. Fill our home with patience, gentle words, mutual respect, and abiding peace. Guard our health, heal every misunderstanding, and bind our household together in love and faith through every season. Amen.'
  },
  friends: {
    key: 'friends',
    title: 'FRIENDS & LOYAL CIRCLE PRAYER',
    emoji: '🤝',
    openBibleTopics: ['friendship', 'good_friends', 'encouragement'],
    anchorRefs: ['Proverbs 17:17', 'Proverbs 27:17', 'Ecclesiastes 4:9-10', 'John 15:13'],
    focus:
      'true loyal friendships, iron sharpening iron, protection over friends, honest encouragement, and shared joy',
    fallbackVerse: {
      reference: 'Proverbs 27:17 (ESV)',
      text: 'Iron sharpens iron, and one man sharpens another.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Lord of love and fellowship, thank You for the gift of true friends who walk beside me in sunshine and in storms. Bless, protect, and uplift my friends today; refresh their spirits, guide their steps, and help us sharpen one another toward wisdom, integrity, and lasting joy. Amen.'
  },
  self: {
    key: 'self',
    title: 'PERSONAL RENEWAL & SELF PRAYER',
    emoji: '🕊️',
    openBibleTopics: ['self_control', 'clean_heart', 'peace_of_mind'],
    anchorRefs: ['Psalm 51:10', 'Psalm 139:23-24', 'Isaiah 40:31', 'Jeremiah 29:11'],
    focus:
      'inner peace, purity of heart, emotional healing, self-discipline, clarity of purpose, and spiritual growth',
    fallbackVerse: {
      reference: 'Psalm 51:10 (ESV)',
      text: 'Create in me a clean heart, O God, and renew a right spirit within me.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Search me, O God, and renew my mind and spirit from within. Quiet every anxious or heavy thought, heal hidden wounds, and clothe me with self-discipline, humility, and quiet strength. Align my desires with Your purpose so I walk in peace and integrity today. Amen.'
  },
  group: {
    key: 'group',
    title: 'GROUP UNITY & COLLECTIVE BLESSING PRAYER',
    emoji: '👥',
    openBibleTopics: ['unity', 'fellowship', 'working_together'],
    anchorRefs: ['Matthew 18:19-20', 'Psalm 133:1', 'Romans 15:5-6', 'Philippians 2:2'],
    focus:
      'harmony in our group/community, shared vision, mutual respect, uplifting conversations, and collective protection',
    fallbackVerse: {
      reference: 'Matthew 18:20 (ESV)',
      text: 'For where two or three are gathered in my name, there am I among them.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Father of unity and peace, we lift up every member of this group into Your care. Let wisdom, kindness, and genuine brotherhood rule our conversations. Bless each person’s silent battles, multiply our shared joy, and make this community a safe harbor of encouragement and growth. Amen.'
  },
  motivational: {
    key: 'motivational',
    title: 'MOTIVATIONAL STRENGTH & COURAGE PRAYER',
    emoji: '🔥',
    openBibleTopics: ['perseverance', 'strength', 'courage'],
    anchorRefs: ['Joshua 1:9', 'Philippians 4:13', 'Isaiah 41:10', 'Galatians 6:9'],
    focus:
      'unstoppable perseverance, courage over fear, renewed energy when tired, and bold execution of purpose',
    fallbackVerse: {
      reference: 'Joshua 1:9 (ESV)',
      text: 'Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Almighty God, breathe fresh fire, courage, and endurance into my spirit today. Where weariness whispers quit, remind me that Your strength is made perfect in me. Banish procrastination and fear, steady my hands, and empower me to press forward boldly without growing weary. Amen.'
  },
  success: {
    key: 'success',
    title: 'SUCCESS, EXCELLENCE & BREAKTHROUGH PRAYER',
    emoji: '🏆',
    openBibleTopics: ['success', 'plans', 'diligence'],
    anchorRefs: ['Proverbs 16:3', 'Proverbs 3:5-6', 'Psalm 20:4', 'Psalm 90:17'],
    focus:
      'committing plans and projects to God, favor with decision-makers, excellence in execution, and lasting ethical success',
    fallbackVerse: {
      reference: 'Proverbs 16:3 (ESV)',
      text: 'Commit your work to the LORD, and your plans will be established.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Lord of excellence and favor, I commit my plans, goals, and daily labor into Your hands. Establish the work of my hands, grant me favor before God and people, and guide every decision with sharp discernment. Crown diligent effort with meaningful breakthrough and keep my heart humble in victory. Amen.'
  },
  failure: {
    key: 'failure',
    title: 'OVERCOMING FAILURE, GRACE & COMEBACK PRAYER',
    emoji: '🌅',
    openBibleTopics: ['failure', 'overcoming_failure', 'hope'],
    anchorRefs: ['Proverbs 24:16', '2 Corinthians 12:9', 'Psalm 73:26', 'Micah 7:8'],
    focus:
      'healing from disappointment and failure, releasing shame or regret, finding God’s sufficient grace in weakness, and rising stronger again',
    fallbackVerse: {
      reference: 'Proverbs 24:16 (ESV)',
      text: 'For the righteous falls seven times and rises again, but the wicked stumble in times of calamity.',
      source: 'OpenBible / ESV'
    },
    fallbackPrayer:
      'Merciful Father, I bring my disappointment, mistakes, and heavy heart honestly before You. Remind me that a setback is never the end of my story in Your hands. Lift away shame and self-doubt, turn every lesson into wisdom, and raise me up stronger, wiser, and anchored in Your unfailing grace. Amen.'
  }
};

const ALIAS_TO_CATEGORY = {
  exam: 'exam',
  exams: 'exam',
  study: 'exam',
  test: 'exam',
  academic: 'exam',
  travel: 'travel',
  journey: 'travel',
  trip: 'travel',
  flight: 'travel',
  safetravel: 'travel',
  prosperity: 'prosperity',
  wealth: 'prosperity',
  finances: 'prosperity',
  money: 'prosperity',
  abundance: 'prosperity',
  provision: 'prosperity',
  family: 'family',
  home: 'family',
  household: 'family',
  parents: 'family',
  children: 'family',
  friends: 'friends',
  friend: 'friends',
  friendship: 'friends',
  bestie: 'friends',
  self: 'self',
  me: 'self',
  personal: 'self',
  myself: 'self',
  group: 'group',
  team: 'group',
  community: 'group',
  baze: 'group',
  church: 'group',
  motivational: 'motivational',
  motivate: 'motivational',
  motivation: 'motivational',
  strength: 'motivational',
  courage: 'motivational',
  success: 'success',
  victory: 'success',
  breakthrough: 'success',
  career: 'success',
  win: 'success',
  failure: 'failure',
  fail: 'failure',
  setback: 'failure',
  mistake: 'failure',
  comeback: 'failure',
  restoration: 'failure'
};

export function resolvePrayerCategoryKey(word = '') {
  const clean = String(word || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return ALIAS_TO_CATEGORY[clean] || null;
}

/**
 * Live Scripture extraction from OpenBible.info professional topical Bible index (ESV).
 */
export async function extractTopicalScriptureFromSites(topicSlug, anchorRefs = []) {
  // 1. OpenBible.info Topical Concordance (ESV)
  if (topicSlug) {
    try {
      const slug = String(topicSlug)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const { data } = await axios.get(`https://www.openbible.info/topics/${slug}`, {
        timeout: 8500,
        headers: { 'User-Agent': UA }
      });
      const matches = [
        ...String(data).matchAll(
          /<div class="verse"[\s\S]*?<a href="[^"]*" class="bibleref"[^>]*>([^<]+)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g
        )
      ].slice(0, 8);

      if (matches.length > 0) {
        const chosen = matches[Math.floor(Math.random() * Math.min(matches.length, 5))];
        const ref = decodeHtmlEntities(chosen[1]);
        const verseText = decodeHtmlEntities(chosen[2]);
        if (ref && verseText.length > 15) {
          return {
            reference: `${ref} (ESV)`,
            text: verseText.slice(0, 380),
            source: 'OpenBible.info Topical Concordance'
          };
        }
      }
    } catch {
      // Fall through to bible-api.com / BibleGateway
    }
  }

  // 2. Direct Bible Passage Extraction via bible-api.com for canonical anchor refs
  if (anchorRefs.length > 0) {
    const pickRef = anchorRefs[Math.floor(Math.random() * anchorRefs.length)];
    try {
      const { data } = await axios.get(
        `https://bible-api.com/${encodeURIComponent(pickRef)}`,
        { timeout: 8000 }
      );
      if (data?.text && data?.reference) {
        return {
          reference: `${data.reference} (${(data.translation_id || 'WEB').toUpperCase()})`,
          text: String(data.text).replace(/\s+/g, ' ').trim().slice(0, 380),
          source: 'Bible-API Scripture Engine'
        };
      }
    } catch {
      // Fall through
    }
  }

  // 3. BibleGateway Verse of the Day API
  try {
    const { data } = await axios.get(
      'https://www.biblegateway.com/votd/get/?format=json&version=NIV',
      { timeout: 8000, headers: { 'User-Agent': UA } }
    );
    if (data?.votd?.text && data?.votd?.reference) {
      return {
        reference: `${decodeHtmlEntities(data.votd.reference)} (NIV)`,
        text: decodeHtmlEntities(data.votd.text).slice(0, 380),
        source: 'BibleGateway NIV'
      };
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Generate a rich, Scripture-anchored Prayer for any of the 10 specialized categories
 * (or custom free-form intention), extracting real Bible verses from professional sites
 * and weaving an inspired prayer via TEXMEX-MD AI.
 */
export async function generateSpecializedPrayer(categoryKeyOrRaw = '', extraContext = '') {
  const mappedKey = resolvePrayerCategoryKey(categoryKeyOrRaw);
  const blueprint = mappedKey ? PRAYER_CATEGORIES[mappedKey] : null;

  // Determine topical slug & personal context
  let topicSlug = 'prayer';
  let personalNote = String(extraContext || '').trim();

  if (blueprint) {
    topicSlug =
      blueprint.openBibleTopics[
        Math.floor(Math.random() * blueprint.openBibleTopics.length)
      ];
  } else if (categoryKeyOrRaw) {
    personalNote = [categoryKeyOrRaw, extraContext].filter(Boolean).join(' ').trim();
    const firstTopicWord = personalNote
      .split(/\s+/)
      .find((w) => w.length >= 4 && !/^(prayer|pray|for|about|my|our|the|and)$/i.test(w));
    if (firstTopicWord) topicSlug = firstTopicWord;
  }

  // 1. Live Scripture Extraction from Professional Sites (OpenBible.info / Bible-API / BibleGateway)
  const extracted =
    (await extractTopicalScriptureFromSites(
      topicSlug,
      blueprint ? blueprint.anchorRefs : ['Philippians 4:6-7', 'Psalm 91:1-2', 'Numbers 6:24-26']
    )) ||
    blueprint?.fallbackVerse || {
      reference: 'Philippians 4:6-7 (ESV)',
      text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.',
      source: 'OpenBible / ESV'
    };

  // 2. Compose Scripture-rooted prayer using TEXMEX-MD AI
  const heading = blueprint
    ? `${blueprint.emoji} *${blueprint.title}*`
    : `🙏 *SCRIPTURE-ANCHORED PRAYER*`;

  try {
    const prompt = [
      `Write a deeply heartfelt, reverent, uplifting Christian prayer (5 to 7 concise sentences) directly rooted in this extracted Bible scripture:`,
      `Scripture: "${extracted.text}" — ${extracted.reference}`,
      blueprint ? `Prayer Category Focus: ${blueprint.focus}` : '',
      personalNote ? `Specific Personal Intention / Context: "${personalNote}"` : '',
      `Instructions: Weave the promise of the scripture naturally into the prayer, end with "Amen.", and return ONLY the prayer paragraph itself (do not repeat the verse header, as we display the verse above it).`
    ]
      .filter(Boolean)
      .join('\n');

    const aiPrayer = await askTexmexAi(prompt, {
      systemPrompt:
        'You are a compassionate, biblically faithful pastor and prayer writer inspired by classic devotional sites (BibleGateway, Crosswalk, OpenBible). Write warm, eloquent, scripture-grounded prayers.'
    });

    if (aiPrayer && aiPrayer.length > 40) {
      return (
        `${heading}\n\n` +
        `📖 *"${extracted.text}"*\n` +
        `— *${extracted.reference}*\n\n` +
        `🙏 *Prayer:*\n${aiPrayer.trim()}\n\n` +
        `_📚 Extracted via ${extracted.source} · TEXMEX-MD AI_`
      );
    }
  } catch {
    // Use curated Biblical fallback prayer below
  }

  const fallbackBody =
    blueprint?.fallbackPrayer ||
    'Heavenly Father, we thank You for Your living Word and unfailing faithfulness. Hear the cry of our hearts today, surround us with Your peace that surpasses understanding, and guide every step according to Your wisdom and grace. Amen.';

  return (
    `${heading}\n\n` +
    `📖 *"${extracted.text}"*\n` +
    `— *${extracted.reference}*\n\n` +
    `🙏 *Prayer:*\n${fallbackBody}\n\n` +
    `_📚 Extracted via ${extracted.source}_`
  );
}
