import fs from 'node:fs';
import {
  PHONK_GENRES,
  PHONK_MOODS,
  PHONK_TYPES,
  PHONK_EFFECTS,
  normalizeGenre,
  normalizeMood,
  normalizeType,
  normalizeEffect,
  generatePhonkStudioBundle
} from '../lib/phonk-studio.js';
import { pushContentToStatus } from '../lib/status-poster.js';
import { sciFiCard, DEV_SIGNATURE, OFFICIAL_WEB_URL } from '../lib/style.js';

/**
 * Parse flexible studio input:
 * - Pipe format: "132 | brazilian_funk | hypnotic | crushed | slowed | midnight rio no batidao"
 * - Or 4-part pipe: "132 | brazilian_funk | hypnotic | midnight rio crushed slowed"
 * - Or natural text containing optional BPM, mood, type (crushed), effect (slowed), nobatidao
 */
function parsePhonkInput(rawText, forcedGenre = '') {
  const txt = String(rawText || '').trim();
  const lower = txt.toLowerCase();
  const forceNoBatidao =
    lower.includes('no batidao') ||
    lower.includes('nobatidao') ||
    lower.includes('instrumental');

  if (txt.includes('|')) {
    const parts = txt.split('|').map((s) => s.trim());
    const bpmNum = Number.parseInt(parts[0], 10);
    if (Number.isFinite(bpmNum) && parts.length >= 3) {
      if (parts.length >= 6) {
        return {
          bpm: bpmNum,
          genre: forcedGenre || normalizeGenre(parts[1]),
          mood: normalizeMood(parts[2]),
          type: normalizeType(parts[3]),
          effect: normalizeEffect(parts[4]),
          vocalMode: forceNoBatidao ? 'cd_no_batidao' : 'auto_aligned',
          prompt: parts.slice(5).join(' | ') || parts[2]
        };
      }
      const tail = parts.slice(3).join(' | ') || parts[2];
      return {
        bpm: bpmNum,
        genre: forcedGenre || normalizeGenre(parts[1]),
        mood: normalizeMood(parts[2]),
        type: normalizeType(tail),
        effect: normalizeEffect(tail),
        vocalMode: forceNoBatidao ? 'cd_no_batidao' : 'auto_aligned',
        prompt: tail
      };
    }
  }

  const bpmMatch = txt.match(/\b(9\d|1\d{2})\s*(?:bpm)?\b/i);
  const detectedGenre = forcedGenre || normalizeGenre(txt);
  const detectedMood = normalizeMood(txt);
  const detectedType = normalizeType(txt);
  const detectedEffect = normalizeEffect(txt);
  const bpm = bpmMatch
    ? Number.parseInt(bpmMatch[1], 10)
    : PHONK_GENRES[detectedGenre].defaultBpm;

  return {
    bpm,
    genre: detectedGenre,
    mood: detectedMood,
    type: detectedType,
    effect: detectedEffect,
    vocalMode: forceNoBatidao ? 'cd_no_batidao' : 'auto_aligned',
    prompt: txt
  };
}

async function runPhonkCommand({ sock, m, text, prefix, forcedGenre = '', pushStatus = false }) {
  if (!text && !forcedGenre) {
    return m.reply(
      sciFiCard('AI PHONK & NO BATIDÃO STUDIO (160s+)', [
        `🎛️ *Specify BPM, Genre, Mood, Type, Effect & Prompt:*`,
        `▸ ${prefix}phonk <BPM> | <Genre> | <Mood> | <Type> | <Effect> | <Prompt>`,
        ``,
        `🥁 *Genres:* brazilian_funk · drift_phonk · phonk · favela · trap · jumpstyle`,
        `🌀 *Moods:* hypnotic · energetic · aggressive · dark · drift · favela_heat · euphoric`,
        `💥 *Types:* no_batidao_cd · crushed · automotivo · memphis_tape`,
        `🌊 *Effects:* none · slowed · sped_up · bass_boost`,
        `🎙️ *Vocals:* Beat-aligned Best/Alt AI Vocals — auto-switches to *YouTube No Batidão CD Instrumental* if vocals are unaligned!`,
        ``,
        `⚡ *Examples (160s+ Full Song MP4 + MP3):*`,
        `  ${prefix}phonk 130 | brazilian_funk | hypnotic | crushed | slowed | midnight rio no batidao`,
        `  ${prefix}driftphonk 160 | aggressive | crushed | tokyo midnight drift`,
        `🌐 *Web Studio:* ${OFFICIAL_WEB_URL}`
      ])
    );
  }

  const params = parsePhonkInput(
    text || `${PHONK_GENRES[forcedGenre || 'brazilian_funk'].defaultBpm} hypnotic club anthem`,
    forcedGenre
  );

  await m.reply(
    `🎛️ *AI Phonk Studio producing full 160s+ song...*\n` +
      `• *Kit:* ${PHONK_GENRES[params.genre].label}\n` +
      `• *BPM:* ${params.bpm} · *Mood:* ${PHONK_MOODS[params.mood].label}\n` +
      `• *Type:* ${PHONK_TYPES[params.type].label}\n` +
      `• *Effect:* ${PHONK_EFFECTS[params.effect].label}\n` +
      `• *Vocals:* Smart Beat-Align / No Batidão CD Instrumental Gate`
  );

  let mp3SentEarly = false;
  const bundle = await generatePhonkStudioBundle({
    prompt: params.prompt,
    bpm: params.bpm,
    genre: params.genre,
    mood: params.mood,
    type: params.type,
    effect: params.effect,
    durationSec: 168,
    includeVocals: params.vocalMode !== 'cd_no_batidao',
    vocalMode: params.vocalMode,
    onMp3Ready: async (partial) => {
      // Deliver the mastered 160s+ MP3 song immediately (~4s) while the MP4 visualizer finishes!
      const mp3Buf = fs.readFileSync(partial.paths.mp3Path);
      await sock.sendMessage(
        m.chat,
        {
          audio: mp3Buf,
          mimetype: 'audio/mpeg',
          fileName: `${partial.slug}.mp3`,
          ptt: false
        },
        { quoted: m.raw }
      );
      mp3SentEarly = true;
    }
  });

  const mp4Buf = fs.readFileSync(bundle.paths.mp4Path);
  const caption =
    sciFiCard('AI PHONK STUDIO // 160s+ CD MASTER', [
      `🎵 *Title:* ${bundle.title}`,
      `💿 *Album:* ${bundle.album}`,
      `⏱️ *Length:* ${bundle.durationSec}s (${Math.floor(bundle.durationSec / 60)}m ${Math.round(bundle.durationSec % 60)}s · ${bundle.bars} bars)`,
      `🥁 *Kit:* ${bundle.genreLabel}`,
      `🌀 *BPM / Mood:* ${bundle.effectiveBpm} BPM · ${bundle.moodLabel}`,
      `💥 *Type / FX:* ${bundle.typeLabel} · ${bundle.effectLabel}`,
      `🎙️ *Vocal Engine:* ${bundle.vocalModeUsed}`,
      `📦 *Consistent Export:* Mastered MP3 + Full MP4 Anime Visualizer!`
    ]);

  await sock.sendMessage(
    m.chat,
    {
      video: mp4Buf,
      mimetype: 'video/mp4',
      caption
    },
    { quoted: m.raw }
  );

  if (!mp3SentEarly) {
    const mp3Buf = fs.readFileSync(bundle.paths.mp3Path);
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
  }

  if (pushStatus) {
    const res = await pushContentToStatus(sock, {
      video: mp4Buf,
      caption:
        `🎵 *${bundle.title}* (${bundle.durationSec}s · ${bundle.effectiveBpm} BPM)\n` +
        `_${DEV_SIGNATURE}_`
    });
    await m.reply(`📡 *Visualizer MP4 also pushed to your WhatsApp Status (${res.recipientsCount} contacts)!*`);
  }
}

export default [
  {
    name: 'phonk',
    aliases: ['phonkstudio', 'makephonk', 'aiphonk', 'nobatidao'],
    category: 'phonk',
    desc: '160s+ AI Phonk & No Batidão Studio — supports Hypnotic mood, Crushed type, Slowed effect & Smart Vocal Alignment (MP4 + MP3)',
    usage: '.phonk <BPM> | <Genre> | <Mood> | <Type> | <Effect> | <Prompt>',
    react: '🎵',
    async execute(ctx) {
      await runPhonkCommand(ctx);
    }
  },
  {
    name: 'brazilianfunk',
    aliases: ['funk', 'automotivo', 'montagem', 'brfunk'],
    category: 'phonk',
    desc: '160s+ 2020s Brazilian Automotivo / No Batidão song with bass melodies, aligned AI vocals or CD instrumental & Anime Visualizer',
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
    desc: '160s+ 808 Cowbell Drift Phonk song with Crushed / Slowed support & Anime Visualizer (MP4 + MP3)',
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
    desc: '160s+ Favela Baile Funk song with Tamborzão rhythm, bouncing bass & Anime Visualizer (MP4 + MP3)',
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
    desc: '160s+ 2020s Hard Rage / Spinz 808 Trap song & Anime Visualizer (MP4 + MP3)',
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
    desc: '160s+ Hard Jumpstyle / Krushclub rave song with reverse-bass donk, Crushed grit & Anime Visualizer (MP4 + MP3)',
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
    desc: 'Produce a 160s+ AI Phonk / No Batidão song + Anime Visualizer MP4 and publish straight to WhatsApp Status',
    usage: '.pushphonk <BPM> | <Genre> | <Mood> | <Type> | <Effect> | <Prompt>',
    ownerOnly: true,
    react: '📡',
    async execute(ctx) {
      await runPhonkCommand({ ...ctx, pushStatus: true, forcedGenre: ctx.text ? '' : 'brazilian_funk' });
    }
  }
];
