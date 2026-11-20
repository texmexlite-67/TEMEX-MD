import fs from 'node:fs';
import {
  PHONK_GENRES,
  PHONK_MOODS,
  normalizeGenre,
  normalizeMood,
  generatePhonkStudioBundle
} from '../lib/phonk-studio.js';
import { pushContentToStatus } from '../lib/status-poster.js';
import { sciFiCard, DEV_SIGNATURE, OFFICIAL_WEB_URL } from '../lib/style.js';

/**
 * Parse flexible studio input:
 * - Pipe format: "132 | brazilian_funk | energetic | midnight neon street bass"
 * - Or natural text containing optional BPM (e.g. "160bpm aggressive tokyo drift cowbell")
 */
function parsePhonkInput(rawText, forcedGenre = '') {
  const txt = String(rawText || '').trim();
  if (txt.includes('|')) {
    const parts = txt.split('|').map((s) => s.trim());
    const bpmNum = Number.parseInt(parts[0], 10);
    if (Number.isFinite(bpmNum) && parts.length >= 3) {
      return {
        bpm: bpmNum,
        genre: forcedGenre || normalizeGenre(parts[1]),
        mood: normalizeMood(parts[2]),
        prompt: parts.slice(3).join(' | ') || parts[2]
      };
    }
  }

  const bpmMatch = txt.match(/\b(9\d|1\d{2})\s*(?:bpm)?\b/i);
  const detectedGenre = forcedGenre || normalizeGenre(txt);
  const detectedMood = normalizeMood(txt);
  const bpm = bpmMatch
    ? Number.parseInt(bpmMatch[1], 10)
    : PHONK_GENRES[detectedGenre].defaultBpm;

  return {
    bpm,
    genre: detectedGenre,
    mood: detectedMood,
    prompt: txt
  };
}

async function runPhonkCommand({ sock, m, text, prefix, forcedGenre = '', pushStatus = false }) {
  if (!text && !forcedGenre) {
    return m.reply(
      sciFiCard('AI PHONK & FUNK STUDIO — SETUP', [
        `🎛️ *Please specify your BPM, Genre, Mood & Prompt:*`,
        `▸ *Format:* ${prefix}phonk <BPM> | <Genre> | <Mood> | <Prompt>`,
        ``,
        `🥁 *Available Studio Kits / Genres:*`,
        `  • *brazilian_funk* (2020s Automotivo / Montagem Bass)`,
        `  • *drift_phonk* (808 Tuned Cowbell Drift)`,
        `  • *phonk* (Classic Dark Street Phonk)`,
        `  • *favela* (Favela Baile Funk Rhythm)`,
        `  • *trap* (2020s Hard Rage / Spinz 808 Trap)`,
        `  • *jumpstyle* (Hard Jumpstyle / Reverse Donk)`,
        ``,
        `🔥 *Available Moods:*`,
        `  • energetic · aggressive · dark · drift · favela_heat · euphoric`,
        ``,
        `⚡ *Example:*`,
        `  ${prefix}phonk 132 | brazilian_funk | energetic | midnight neon rio bassline`,
        `  ${prefix}driftphonk 160 | aggressive | tokyo street race`,
        `🌐 *Full Web Visualizer Studio:* ${OFFICIAL_WEB_URL}`
      ])
    );
  }

  const params = parsePhonkInput(
    text || `${PHONK_GENRES[forcedGenre || 'brazilian_funk'].defaultBpm} energetic club anthem`,
    forcedGenre
  );

  await m.reply(
    `🎛️ *AI Phonk Studio synthesizing...*\n` +
      `• *Kit:* ${PHONK_GENRES[params.genre].label}\n` +
      `• *BPM:* ${params.bpm} · *Mood:* ${PHONK_MOODS[params.mood].label}\n` +
      `• *Pipeline:* AI Prompt Upgrade → 2020s Bass & Lead → AI Vocals → Anime Theme → Consistent MP4 + MP3`
  );

  const bundle = await generatePhonkStudioBundle({
    prompt: params.prompt,
    bpm: params.bpm,
    genre: params.genre,
    mood: params.mood,
    includeVocals: true
  });

  const mp4Buf = fs.readFileSync(bundle.paths.mp4Path);
  const mp3Buf = fs.readFileSync(bundle.paths.mp3Path);

  const caption =
    sciFiCard('AI PHONK STUDIO // RENDERED', [
      `🎵 *Title:* ${bundle.title}`,
      `💿 *Album:* ${bundle.album}`,
      `🥁 *Kit:* ${bundle.genreLabel}`,
      `⚡ *BPM:* ${bundle.bpm} · *Mood:* ${bundle.moodLabel}`,
      `🎙️ *AI Vocals:* "${bundle.vocalScript}"`,
      `✨ *AI Direction:* ${bundle.enhancedPrompt}`,
      `📦 *Consistent Export:* MP4 Visualizer + 320kbps MP3 below!`
    ]);

  // 1. Deliver Rendered Anime Visualizer MP4 Video
  await sock.sendMessage(
    m.chat,
    {
      video: mp4Buf,
      mimetype: 'video/mp4',
      caption
    },
    { quoted: m.raw }
  );

  // 2. Deliver Consistent Mastered 320kbps MP3 Audio File
  await sock.sendMessage(
    m.chat,
    {
      audio: mp3Buf,
      mimetype: 'audio/mpeg',
      fileName: `${bundle.slug}.mp3`,
      ptt: false
    },
    { quoted: m.raw }
  );

  if (pushStatus) {
    const res = await pushContentToStatus(sock, {
      video: mp4Buf,
      caption:
        `🎵 *${bundle.title}* (${bundle.bpm} BPM · ${bundle.genreLabel})\n` +
        `_${DEV_SIGNATURE}_`
    });
    await m.reply(`📡 *Visualizer MP4 also pushed to your WhatsApp Status (${res.recipientsCount} contacts)!*`);
  }
}

export default [
  {
    name: 'phonk',
    aliases: ['phonkstudio', 'makephonk', 'aiphonk'],
    category: 'phonk',
    desc: 'AI Phonk & 2020s Brazilian Funk Studio — asks for BPM, Genre, Mood & Prompt, then renders consistent Anime Visualizer MP4 + Mastered MP3',
    usage: '.phonk <BPM> | <Genre> | <Mood> | <Prompt>',
    react: '🎵',
    async execute(ctx) {
      await runPhonkCommand(ctx);
    }
  },
  {
    name: 'brazilianfunk',
    aliases: ['funk', 'automotivo', 'montagem', 'brfunk'],
    category: 'phonk',
    desc: 'Generate a 2020s Brazilian Automotivo / Montagem Funk banger with sliding bass melodies, AI vocals & Anime Visualizer (MP4 + MP3)',
    usage: '.brazilianfunk [BPM | Mood | Prompt]',
    react: '🇧🇷',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, forcedGenre: 'brazilian_funk' });
    }
  },
  {
    name: 'driftphonk',
    aliases: ['drift', 'cowbell'],
    category: 'phonk',
    desc: 'Generate a high-speed 808 Cowbell Drift Phonk anthem with Memphis AI vocal chops & Anime Visualizer (MP4 + MP3)',
    usage: '.driftphonk [BPM | Mood | Prompt]',
    react: '🏎️',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, forcedGenre: 'drift_phonk' });
    }
  },
  {
    name: 'favela',
    aliases: ['baile', 'favelafunk'],
    category: 'phonk',
    desc: 'Generate an energetic Favela Baile Funk rhythm with bouncing sub-bass, AI MC vocals & Anime Visualizer (MP4 + MP3)',
    usage: '.favela [BPM | Mood | Prompt]',
    react: '🔥',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, forcedGenre: 'favela' });
    }
  },
  {
    name: 'trapbeat',
    aliases: ['trap', 'ragebeat'],
    category: 'phonk',
    desc: 'Generate a hard 2020s Rage / Spinz 808 Trap beat with AI vocals & Anime Visualizer (MP4 + MP3)',
    usage: '.trapbeat [BPM | Mood | Prompt]',
    react: '⚡',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, forcedGenre: 'trap' });
    }
  },
  {
    name: 'jumpstyle',
    aliases: ['krushclub', 'jumpbeat'],
    category: 'phonk',
    desc: 'Generate a 2020s Hard Jumpstyle / Krushclub rave track with reverse-bass donk, AI vocals & Anime Visualizer (MP4 + MP3)',
    usage: '.jumpstyle [BPM | Mood | Prompt]',
    react: '🔊',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, forcedGenre: 'jumpstyle' });
    }
  },
  {
    name: 'pushphonk',
    aliases: ['phonkstatus'],
    category: 'phonk',
    desc: 'Generate an AI Phonk / Brazilian Funk Anime Visualizer MP4 + MP3 and publish the Visualizer straight to your WhatsApp Status',
    usage: '.pushphonk <BPM> | <Genre> | <Mood> | <Prompt>',
    ownerOnly: true,
    react: '📡',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, pushStatus: true, forcedGenre: ctx.text ? '' : 'brazilian_funk' });
    }
  }
];
