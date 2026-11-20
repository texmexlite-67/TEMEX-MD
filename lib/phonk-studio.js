import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

import { getFfmpegPath, getSharp } from './env.js';
import { askTexmexAi } from './ai.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

export const STUDIO_ROOT = path.resolve(process.cwd(), '.cache', 'studio');
fs.mkdirSync(STUDIO_ROOT, { recursive: true });

export const PHONK_GENRES = {
  brazilian_funk: {
    id: 'brazilian_funk',
    label: 'Brazilian Funk 2020s (Automotivo / Montagem)',
    shortLabel: 'Brazilian Funk 2020s',
    defaultBpm: 130,
    minBpm: 115,
    maxBpm: 148,
    rootMidi: 31, // G1 (49 Hz club sub)
    voiceId: 'pt-BR-AntonioNeural',
    vocalStyle: 'montagem',
    leadStyle: 'tuim_brass',
    bassStyle: 'automotivo_sub',
    defaultChant: 'Vai! Toma! Som automotivo na pista, grave batendo forte!',
    kickSteps: [1, 0, 0, 0.92, 0, 0, 0.96, 0, 0, 0.86, 0, 0, 0.94, 0, 0.72, 0],
    snareSteps: [0, 0, 0.85, 0, 0, 0.88, 0, 0.62, 0, 0, 0.86, 0, 0, 0.82, 0, 0.92],
    hatSteps: [0.5, 0.3, 0.65, 0.35, 0.5, 0.3, 0.7, 0.4, 0.5, 0.3, 0.65, 0.35, 0.55, 0.35, 0.75, 0.45],
    percSteps: [0, 0.65, 0, 0, 0.75, 0, 0, 0.7, 0, 0.6, 0, 0.78, 0, 0, 0.8, 0],
    animeTags: ['headphones neon', 'cyberpunk music', 'streetwear night']
  },
  drift_phonk: {
    id: 'drift_phonk',
    label: 'Drift Phonk (808 Cowbell)',
    shortLabel: 'Drift Phonk',
    defaultBpm: 160,
    minBpm: 142,
    maxBpm: 185,
    rootMidi: 30, // F#1
    voiceId: 'en-US-GuyNeural',
    vocalStyle: 'memphis_dark',
    leadStyle: 'cowbell_808',
    bassStyle: 'distorted_808',
    defaultChant: 'Step on the gas, midnight drift in the shadow, full throttle no brakes!',
    kickSteps: [1, 0, 0, 0, 0, 0, 0.88, 0, 0.96, 0, 0.78, 0, 0, 0, 0.84, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.48],
    hatSteps: [0.75, 0.55, 0.8, 0.6, 0.75, 0.55, 0.85, 0.9, 0.75, 0.55, 0.8, 0.6, 0.78, 0.7, 0.9, 0.95],
    percSteps: [0, 0, 0.5, 0, 0, 0, 0.55, 0, 0, 0, 0.5, 0, 0, 0.6, 0, 0.7],
    animeTags: ['car night', 'cyberpunk city', 'motor_vehicle night']
  },
  phonk: {
    id: 'phonk',
    label: 'Classic Dark Street Phonk',
    shortLabel: 'Classic Phonk',
    defaultBpm: 140,
    minBpm: 120,
    maxBpm: 158,
    rootMidi: 29, // F1
    voiceId: 'en-US-AndrewMultilingualNeural',
    vocalStyle: 'memphis_dark',
    leadStyle: 'phonk_bell_cowbell',
    bassStyle: 'reese_808',
    defaultChant: 'Underground syndicate, dark streets awake at midnight, feel the bassline!',
    kickSteps: [1, 0, 0, 0.75, 0, 0, 0, 0.85, 0.95, 0, 0, 0, 0, 0, 0.8, 0],
    snareSteps: [0, 0, 0, 0, 0.96, 0, 0, 0, 0, 0, 0, 0, 0.98, 0, 0, 0],
    hatSteps: [0.7, 0.35, 0.75, 0.4, 0.7, 0.35, 0.8, 0.45, 0.7, 0.35, 0.75, 0.4, 0.72, 0.55, 0.85, 0.65],
    percSteps: [0, 0, 0, 0.5, 0, 0, 0.6, 0, 0, 0.5, 0, 0, 0, 0, 0.65, 0],
    animeTags: ['katana night', 'moonlight dark', 'red_eyes night']
  },
  favela: {
    id: 'favela',
    label: 'Favela Baile Funk',
    shortLabel: 'Favela Funk',
    defaultBpm: 135,
    minBpm: 122,
    maxBpm: 150,
    rootMidi: 33, // A1
    voiceId: 'pt-BR-AntonioNeural',
    vocalStyle: 'favela_mc',
    leadStyle: 'favela_horn',
    bassStyle: 'favela_bounce',
    defaultChant: 'Solta o tamborzão da favela! Energia lá no alto, ninguém fica parado!',
    kickSteps: [1, 0, 0, 0.9, 0, 0, 0.95, 0, 0, 0, 0.88, 0, 0.92, 0, 0, 0],
    snareSteps: [0, 0, 0.9, 0, 0, 0.86, 0, 0, 0, 0.92, 0, 0.85, 0, 0, 0.94, 0],
    hatSteps: [0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 0.65, 0.35, 0.6, 0.3, 0.6, 0.3, 0.65, 0.4, 0.75, 0.5],
    percSteps: [0, 0.75, 0, 0.6, 0, 0, 0.8, 0.55, 0, 0.7, 0, 0, 0.75, 0.6, 0, 0.85],
    animeTags: ['streetwear sunset', 'headphones city', 'city_lights']
  },
  trap: {
    id: 'trap',
    label: '2020s Hard Rage / Dark Trap',
    shortLabel: 'Hard Trap',
    defaultBpm: 145,
    minBpm: 125,
    maxBpm: 170,
    rootMidi: 29, // F1
    voiceId: 'en-US-GuyNeural',
    vocalStyle: 'trap_hype',
    leadStyle: 'rage_saw',
    bassStyle: 'spinz_808',
    defaultChant: 'Turn the vault up! Heavy eight oh eight shaking the whole block tonight!',
    kickSteps: [1, 0, 0, 0, 0, 0, 0.85, 0.75, 0, 0, 0.95, 0, 0, 0, 0.82, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatSteps: [0.85, 0.65, 0.85, 0.75, 0.85, 0.7, 0.9, 0.85, 0.85, 0.65, 0.9, 0.8, 0.85, 0.85, 0.95, 0.95],
    percSteps: [0, 0, 0, 0.65, 0, 0, 0, 0, 0, 0.65, 0, 0, 0, 0, 0, 0.75],
    animeTags: ['lightning night', 'hoodie neon', 'cyberpunk dark']
  },
  jumpstyle: {
    id: 'jumpstyle',
    label: 'Hard Jumpstyle / Krushclub Rave',
    shortLabel: 'Jumpstyle',
    defaultBpm: 150,
    minBpm: 138,
    maxBpm: 172,
    rootMidi: 31, // G1
    voiceId: 'en-US-AriaNeural',
    vocalStyle: 'rave_jump',
    leadStyle: 'supersaw_rave',
    bassStyle: 'reverse_donk',
    defaultChant: 'Jump to the rhythm! Hands in the cyber sky, feel the rave bass overload!',
    kickSteps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.78],
    snareSteps: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.92, 0, 0, 0],
    hatSteps: [0.4, 0, 0.95, 0, 0.4, 0, 0.95, 0, 0.4, 0, 0.95, 0, 0.4, 0.6, 0.98, 0.75],
    percSteps: [0, 0, 0.85, 0, 0, 0, 0.85, 0, 0, 0, 0.85, 0, 0, 0, 0.9, 0],
    animeTags: ['headphones colorful', 'cyberpunk neon', 'concert']
  }
};

export const PHONK_MOODS = {
  energetic: {
    id: 'energetic',
    label: 'Energetic / High-Octane',
    scale: [0, 1, 4, 5, 7, 8, 10], // Phrygian Dominant
    drive: 1.35,
    primaryHex: '#00f5a0',
    secondaryHex: '#00d9f5',
    ffmpegColors: '#00f5a0|#00d9f5',
    waveColors: '#00d9f5|#00f5a0',
    tintRgb: { r: 6, g: 32, b: 36 }
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive / Hard Overdrive',
    scale: [0, 1, 3, 5, 7, 8, 10], // Dark Phrygian
    drive: 1.65,
    primaryHex: '#ff2a5f',
    secondaryHex: '#ff9e00',
    ffmpegColors: '#ff2a5f|#ff9e00',
    waveColors: '#ff9e00|#ff2a5f',
    tintRgb: { r: 38, g: 8, b: 18 }
  },
  dark: {
    id: 'dark',
    label: 'Dark Midnight / Shadow',
    scale: [0, 1, 3, 5, 6, 8, 10], // Locrian / Dark Phonk
    drive: 1.45,
    primaryHex: '#b5179e',
    secondaryHex: '#ff2a85',
    ffmpegColors: '#b5179e|#ff2a85',
    waveColors: '#ff2a85|#b5179e',
    tintRgb: { r: 24, g: 8, b: 38 }
  },
  drift: {
    id: 'drift',
    label: 'Hypnotic Street Drift',
    scale: [0, 2, 3, 5, 7, 8, 11], // Harmonic Minor
    drive: 1.5,
    primaryHex: '#ff2a85',
    secondaryHex: '#00f0ff',
    ffmpegColors: '#ff2a85|#00f0ff',
    waveColors: '#00f0ff|#ff2a85',
    tintRgb: { r: 22, g: 12, b: 36 }
  },
  favela_heat: {
    id: 'favela_heat',
    label: 'Brazilian Favela Heat',
    scale: [0, 1, 3, 5, 7, 8, 10],
    drive: 1.4,
    primaryHex: '#ffd60a',
    secondaryHex: '#00f5a0',
    ffmpegColors: '#ffd60a|#00f5a0',
    waveColors: '#00f5a0|#ffd60a',
    tintRgb: { r: 28, g: 26, b: 6 }
  },
  euphoric: {
    id: 'euphoric',
    label: 'Euphoric Rave / Cyber',
    scale: [0, 2, 3, 5, 7, 8, 10], // Natural Minor
    drive: 1.28,
    primaryHex: '#00e5ff',
    secondaryHex: '#ffbe0b',
    ffmpegColors: '#00e5ff|#ffbe0b',
    waveColors: '#ffbe0b|#00e5ff',
    tintRgb: { r: 8, g: 26, b: 42 }
  }
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function softClip(x, drive = 1.2) {
  return Math.tanh(x * drive);
}

export function normalizeGenre(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return 'brazilian_funk';
  if (s.includes('drift')) return 'drift_phonk';
  if (s.includes('brazil') || s.includes('funk') || s.includes('automotivo') || s.includes('montagem')) {
    if (s.includes('favela') || s.includes('baile')) return 'favela';
    return 'brazilian_funk';
  }
  if (s.includes('favela') || s.includes('baile')) return 'favela';
  if (s.includes('jump') || s.includes('krush') || s.includes('rave')) return 'jumpstyle';
  if (s.includes('trap') || s.includes('rage')) return 'trap';
  if (s.includes('phonk')) return 'phonk';
  return PHONK_GENRES[s] ? s : 'brazilian_funk';
}

export function normalizeMood(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return 'energetic';
  if (s.includes('aggress') || s.includes('hard') || s.includes('rage')) return 'aggressive';
  if (s.includes('dark') || s.includes('shadow') || s.includes('night')) return 'dark';
  if (s.includes('drift') || s.includes('hypno') || s.includes('race')) return 'drift';
  if (s.includes('favela') || s.includes('party') || s.includes('brazil') || s.includes('heat')) return 'favela_heat';
  if (s.includes('euphor') || s.includes('rave') || s.includes('cyber')) return 'euphoric';
  return PHONK_MOODS[s] ? s : 'energetic';
}

/**
 *Deterministic seed hash so custom prompts produce distinct yet cohesive melodies even offline.
 */
function hashSeed(text) {
  const h = crypto.createHash('sha256').update(String(text || 'texmex')).digest();
  return h;
}

function buildFallbackBlueprint({ prompt, bpm, genreKey, moodKey, customVocals }) {
  const genre = PHONK_GENRES[genreKey];
  const mood = PHONK_MOODS[moodKey];
  const seed = hashSeed(`${prompt}|${bpm}|${genreKey}|${moodKey}`);

  // Build an infectious, memorable 16-step 2020s melodic hook (-1 = rest, >=0 = scale degree)
  const baseMotifs = {
    brazilian_funk: [0, -1, 0, 1, -1, 4, 3, -1, 0, -1, 5, 4, 1, -1, 3, 1],
    favela: [0, 0, -1, 2, -1, 4, 2, -1, 0, -1, 3, 2, 1, -1, 4, 1],
    drift_phonk: [0, 0, 4, 0, 5, 4, 1, -1, 0, 0, 4, 0, 6, 5, 4, 1],
    phonk: [0, -1, 3, -1, 4, 3, 1, -1, 0, -1, 5, 4, 3, -1, 1, -1],
    trap: [0, 4, 7, 4, 0, 5, 7, 5, 0, 4, 8, 7, 5, 4, 1, 4],
    jumpstyle: [0, -1, 4, 4, 5, -1, 4, 2, 0, -1, 6, 5, 4, 2, 4, 7]
  };
  const baseBass = {
    brazilian_funk: [0, -1, -1, 0, -1, -1, 1, -1, -1, 0, -1, -1, 3, -1, 1, -1],
    favela: [0, -1, -1, 0, -1, -1, 2, -1, -1, -1, 1, -1, 0, -1, 4, -1],
    drift_phonk: [0, 0, -1, -1, 0, -1, 1, -1, 0, 0, 3, -1, 1, -1, 4, -1],
    phonk: [0, -1, -1, 0, -1, -1, -1, 1, 0, -1, -1, -1, 3, -1, 1, -1],
    trap: [0, -1, -1, -1, 0, -1, 4, 3, 0, -1, 5, -1, 3, -1, 1, -1],
    jumpstyle: [-1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 1, -1]
  };

  const motif = [...(baseMotifs[genreKey] || baseMotifs.brazilian_funk)];
  // Add subtle prompt-driven variation on non-anchor steps while keeping downbeat groove locked
  for (let i = 2; i < 16; i += 3) {
    if (motif[i] >= 0 && (seed[i] % 3 === 0)) {
      motif[i] = (motif[i] + (seed[i + 4] % 3)) % mood.scale.length;
    }
  }

  const words = String(prompt || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => w.toUpperCase());

  const titlePrefix =
    genreKey === 'brazilian_funk'
      ? 'AUTOMOTIVO'
      : genreKey === 'favela'
        ? 'BAILE FAVELA'
        : genreKey === 'drift_phonk'
          ? 'DRIFT OVERDRIVE'
          : genreKey === 'jumpstyle'
            ? 'KRUSH JUMP'
            : genreKey === 'trap'
              ? 'RAGE VAULT'
              : 'MIDNIGHT PHONK';

  const title = words.length ? `${titlePrefix}: ${words.join(' ')}` : `${titlePrefix} ${bpm}`;
  const album = `TEXMEX-MD // ${genre.shortLabel.toUpperCase()} VOL. 1`;

  return {
    title: title.slice(0, 42),
    album: album.slice(0, 44),
    enhancedPrompt:
      `Mastered ${bpm} BPM ${genre.label} anthem in ${mood.label} atmosphere — ` +
      `featuring heavy 2020s sub-bass melodies, punchy syncopated percussion, energetic AI vocal chops, ` +
      `and ${prompt || 'cyberpunk midnight anime street energy'}.`,
    vocalScript: (customVocals || genre.defaultChant).slice(0, 140),
    melodySteps: motif,
    bassSteps: [...(baseBass[genreKey] || baseBass.brazilian_funk)],
    animeTag: genre.animeTags[seed[0] % genre.animeTags.length]
  };
}

/**
 * Use AI to upgrade the user's Prompt, BPM, Genre & Mood into a cohesive Studio Arrangement Blueprint.
 */
export async function enhancePromptWithAi({
  prompt = '',
  bpm = 130,
  genre = 'brazilian_funk',
  mood = 'energetic',
  customVocals = ''
}) {
  const genreKey = normalizeGenre(genre);
  const moodKey = normalizeMood(mood);
  const genreCfg = PHONK_GENRES[genreKey];
  const safeBpm = clamp(Number(bpm) || genreCfg.defaultBpm, 85, 195);

  const fallback = buildFallbackBlueprint({
    prompt,
    bpm: safeBpm,
    genreKey,
    moodKey,
    customVocals
  });

  const aiInstruction =
    `You are an elite 2020s Phonk, Brazilian Automotivo Funk, Drift Phonk, Favela, Trap & Jumpstyle music producer.\n` +
    `Enhance this user track request into a JSON studio production blueprint.\n` +
    `User Prompt: "${prompt || 'Hard 2020s club banger with heavy bass melody and anime midnight vibe'}"\n` +
    `Genre: ${genreCfg.label} | BPM: ${safeBpm} | Mood: ${PHONK_MOODS[moodKey].label}\n` +
    `Respond ONLY with valid single-line JSON matching this exact schema (no markdown fences):\n` +
    `{"title":"UPPERCASE TRACK TITLE (max 34 chars)","album":"UPPERCASE ALBUM NAME (max 36 chars)","enhancedPrompt":"1 vivid sentence improving audio & visual direction","vocalScript":"Short energetic rhythmic vocal hype chant (8-16 words, Portuguese/English if Brazilian/Favela, English otherwise)","melodySteps":[16 integers from -1 to 6 where -1 is rest and 0 is root],"animeTag":"2 safebooru tags joined with + such as cyberpunk+night or car+neon"}`;

  try {
    const raw = await Promise.race([
      askTexmexAi(aiInstruction, { useMemory: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ai-timeout')), 6500))
    ]);
    const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title) fallback.title = String(parsed.title).toUpperCase().slice(0, 42);
      if (parsed.album) fallback.album = String(parsed.album).toUpperCase().slice(0, 44);
      if (parsed.enhancedPrompt) fallback.enhancedPrompt = String(parsed.enhancedPrompt).slice(0, 260);
      if (!customVocals && parsed.vocalScript) {
        fallback.vocalScript = String(parsed.vocalScript).replace(/["<>]/g, '').slice(0, 140);
      }
      if (Array.isArray(parsed.melodySteps) && parsed.melodySteps.length === 16) {
        fallback.melodySteps = parsed.melodySteps.map((n) => {
          const v = Number(n);
          return Number.isFinite(v) ? clamp(Math.round(v), -1, 6) : -1;
        });
      }
      if (parsed.animeTag && /^[a-z0-9_+]+$/i.test(parsed.animeTag)) {
        fallback.animeTag = parsed.animeTag.toLowerCase();
      }
    }
  } catch {
    // Deterministic studio blueprint already ready in `fallback`
  }

  return {
    ...fallback,
    bpm: safeBpm,
    genre: genreKey,
    genreLabel: genreCfg.label,
    mood: moodKey,
    moodLabel: PHONK_MOODS[moodKey].label
  };
}

/**
 * Synthesize AI Vocals via Neural TTS and decode to 44.1kHz mono Float32 array with genre vocal FX.
 */
async function synthesizeAiVocalPcm(vocalScript, genreCfg) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg || !vocalScript) return null;

  const cleanScript = String(vocalScript)
    .replace(/&/g, ' and ')
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanScript) return null;

  const tmpId = crypto.randomBytes(5).toString('hex');
  const mp3Path = path.join(STUDIO_ROOT, `tmp-vox-${tmpId}.mp3`);
  const rawPath = path.join(STUDIO_ROOT, `tmp-vox-${tmpId}.s16le`);

  let ttsInstance = null;
  try {
    const tts = new MsEdgeTTS();
    ttsInstance = tts;
    await tts.setMetadata(
      genreCfg.voiceId || 'en-US-GuyNeural',
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    );
    const { audioStream } = tts.toStream(cleanScript);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('vox-tts-timeout')), 10000);
      audioStream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    try { tts.close(); } catch {}

    const mp3Buf = Buffer.concat(chunks);
    if (mp3Buf.length < 512) return null;
    fs.writeFileSync(mp3Path, mp3Buf);

    // Genre-authentic vocal DSP filter chain:
    // - Drift/Classic Phonk: pitched-down Memphis tape grit + radio bandpass + slap echo
    // - Brazilian Funk / Favela: energetic hype formant + crisp high-mid presence + rhythmic slap
    // - Jumpstyle / Trap: energetic bright presence + stereo chorus/echo
    let af = 'silenceremove=start_periods=1:start_threshold=-42dB,highpass=f=180,lowpass=f=5200,acompressor=threshold=-16dB:ratio=4:makeup=4';
    if (genreCfg.vocalStyle === 'memphis_dark') {
      af = 'silenceremove=start_periods=1:start_threshold=-42dB,asetrate=24000*0.87,aresample=44100,atempo=1.12,highpass=f=280,lowpass=f=3600,acompressor=threshold=-18dB:ratio=5:makeup=5,aecho=0.8:0.75:110:0.28';
    } else if (genreCfg.vocalStyle === 'montagem' || genreCfg.vocalStyle === 'favela_mc') {
      af = 'silenceremove=start_periods=1:start_threshold=-42dB,asetrate=24000*1.04,aresample=44100,atempo=1.08,highpass=f=210,lowpass=f=6200,acompressor=threshold=-15dB:ratio=4.5:makeup=5,aecho=0.8:0.7:95:0.24';
    } else if (genreCfg.vocalStyle === 'rave_jump') {
      af = 'silenceremove=start_periods=1:start_threshold=-42dB,asetrate=24000*1.08,aresample=44100,atempo=1.08,highpass=f=220,lowpass=f=7000,acompressor=threshold=-15dB:ratio=4:makeup=5,aecho=0.8:0.8:125:0.3';
    }

    await execFileAsync(
      ffmpeg,
      ['-y', '-i', mp3Path, '-af', af, '-f', 's16le', '-ac', '1', '-ar', '44100', rawPath],
      { timeout: 12000 }
    );

    const rawBuf = fs.readFileSync(rawPath);
    const samples = new Float32Array(Math.floor(rawBuf.length / 2));
    let peak = 0.01;
    for (let i = 0; i < samples.length; i++) {
      const v = rawBuf.readInt16LE(i * 2) / 32768;
      samples[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const norm = 0.9 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= norm;
    return samples;
  } catch (err) {
    logger.warn('PHONK-VOX', `AI vocal synthesis fallback note: ${err.message}`);
    return null;
  } finally {
    try { ttsInstance?.close?.(); } catch {}
    try { fs.unlinkSync(mp3Path); } catch {}
    try { fs.unlinkSync(rawPath); } catch {}
  }
}

/**
 * Synthesize full 8-bar 44.1kHz Stereo Phonk / 2020s Brazilian Funk Master WAV + 320kbps MP3.
 */
async function renderMasterAudio({
  blueprint,
  voxPcm,
  includeVocals = true,
  outMp3Path,
  albumCoverPath
}) {
  const sr = 44100;
  const genreCfg = PHONK_GENRES[blueprint.genre];
  const moodCfg = PHONK_MOODS[blueprint.mood];
  const bpm = blueprint.bpm;

  const bars = 8; // 8 full bars (128 16th-note steps: ~15-19s club-grade drop + intro + climax)
  const totalSteps = bars * 16;
  const stepSec = 60 / bpm / 4;
  const stepSamples = Math.floor(stepSec * sr);
  const totalSamples = totalSteps * stepSamples + Math.floor(sr * 0.35);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const sidechainEnv = new Float32Array(totalSamples).fill(1.0);

  // Deterministic pseudo-noise table for crisp snares, claps & hi-hats
  const noiseLen = 65536;
  const noise = new Float32Array(noiseLen);
  let lfsr = 0x13579bdf;
  for (let i = 0; i < noiseLen; i++) {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    noise[i] = ((lfsr & 0xffff) / 32768) - 1.0;
  }

  // --- 1. DRUMS & ENERGETIC BRAZILIAN / PHONK RHYTHM KITS ---
  for (let step = 0; step < totalSteps; step++) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const start = step * stepSamples;

    const isIntro = bar === 0;
    const isBuild = bar === 1 && s16 >= 12;
    const isDrop = bar >= 1;

    // A) Punchy Kick + Sidechain Ducking Envelope
    let kickVel = genreCfg.kickSteps[s16] || 0;
    if (isIntro && s16 !== 0 && s16 !== 8) kickVel *= 0.35;
    if (isBuild) kickVel = 0.92; // Pre-drop kick roll!

    if (kickVel > 0) {
      const kickDur = Math.floor(sr * (blueprint.genre === 'jumpstyle' ? 0.30 : 0.24));
      let phase = 0;
      for (let i = 0; i < kickDur && start + i < totalSamples; i++) {
        const t = i / sr;
        // Rapid pitch sweep 175Hz -> 46Hz for hard chest punch
        const f = 46 + 140 * Math.exp(-t * 36);
        phase += (2 * Math.PI * f) / sr;
        const env = Math.exp(-t * 10.5);
        const click = t < 0.008 ? noise[i % noiseLen] * (1 - t / 0.008) * 0.55 : 0;
        const sig = softClip((Math.sin(phase) * 1.35 + click) * env * kickVel, 1.55) * 0.78;
        left[start + i] += sig;
        right[start + i] += sig;

        // Sidechain ducking curve for bass/melody/vocals so every kick punches cleanly!
        const duck = 1.0 - 0.68 * kickVel * Math.exp(-t * 15);
        if (duck < sidechainEnv[start + i]) sidechainEnv[start + i] = duck;
      }
    }

    // B) Snare / Tamborzão Caixa / Trap Clap
    let snareVel = genreCfg.snareSteps[s16] || 0;
    if (isIntro) snareVel *= 0.4;
    if (isBuild && s16 >= 12) snareVel = 0.85;
    if (snareVel > 0) {
      const snareDur = Math.floor(sr * 0.17);
      let bodyPhase = 0;
      for (let i = 0; i < snareDur && start + i < totalSamples; i++) {
        const t = i / sr;
        const bodyFreq = blueprint.genre === 'brazilian_funk' || blueprint.genre === 'favela' ? 235 : 190;
        bodyPhase += (2 * Math.PI * bodyFreq * Math.exp(-t * 8)) / sr;
        const body = Math.sin(bodyPhase) * Math.exp(-t * 22) * 0.55;
        const snap = noise[(i * 3 + step * 97) % noiseLen] * Math.exp(-t * 19) * 0.75;
        const sig = softClip((body + snap) * snareVel, 1.35) * 0.54;
        left[start + i] += sig * 0.96;
        right[start + i] += sig * 1.04;
      }
    }

    // C) Crisp Hi-Hats & Trap/Drift Triplet Hat Rolls
    const hatVel = genreCfg.hatSteps[s16] || 0;
    if (hatVel > 0) {
      const subRolls = (isDrop && (s16 === 7 || s16 === 15) && ['drift_phonk', 'trap'].includes(blueprint.genre)) ? 3 : 1;
      const rollLen = Math.floor(stepSamples / subRolls);
      for (let r = 0; r < subRolls; r++) {
        const hStart = start + r * rollLen;
        const isOpen = blueprint.genre === 'jumpstyle' && s16 % 4 === 2;
        const hDur = Math.floor(sr * (isOpen ? 0.14 : 0.045));
        for (let i = 0; i < hDur && hStart + i < totalSamples; i++) {
          const t = i / sr;
          // High-frequency metallic FM + filtered white noise
          const n = noise[(i + r * 313) % noiseLen] - noise[(i + 1 + r * 313) % noiseLen];
          const env = Math.exp(-t * (isOpen ? 18 : 65));
          const sig = n * env * hatVel * 0.22;
          left[hStart + i] += sig * 1.08;
          right[hStart + i] += sig * 0.92;
        }
      }
    }

    // D) Brazilian Agogô / Favela Atabaque / Jumpstyle Offbeat Perc
    const percVel = genreCfg.percSteps[s16] || 0;
    if (percVel > 0 && isDrop) {
      const pDur = Math.floor(sr * 0.11);
      let pPhase = 0;
      const baseF =
        blueprint.genre === 'brazilian_funk'
          ? (s16 % 2 === 0 ? 680 : 860) // Classic dual-tone Brazilian Agogô!
          : blueprint.genre === 'favela'
            ? 320
            : 520;
      for (let i = 0; i < pDur && start + i < totalSamples; i++) {
        const t = i / sr;
        pPhase += (2 * Math.PI * baseF) / sr;
        const sig = Math.sin(pPhase + 0.6 * Math.sin(pPhase * 2.41)) * Math.exp(-t * 28) * percVel * 0.24;
        left[start + i] += sig * 0.88;
        right[start + i] += sig * 1.12;
      }
    }
  }

  // --- 2. 2020s BRAZILIAN BASS MELODIES / 808 GLIDES / JUMPSTYLE REVERSE DONK ---
  const scale = moodCfg.scale;
  const rootMidi = genreCfg.rootMidi;

  for (let step = 0; step < totalSteps; step++) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    if (bar === 0 && s16 >= 8) continue; // Intro tension gap before drop!

    const deg = blueprint.bassSteps[s16];
    if (deg === undefined || deg < 0) continue;

    const semitone = scale[deg % scale.length] + (deg >= scale.length ? 12 : 0);
    // Octave jump accent on energetic bars
    const octaveBoost = (bar % 2 === 1 && s16 >= 12) ? 12 : 0;
    const targetFreq = midiToFreq(rootMidi + semitone + octaveBoost);

    const start = step * stepSamples;
    const dur = Math.floor(stepSamples * (genreCfg.bassStyle === 'reverse_donk' ? 1.05 : 1.85));
    let phase1 = 0;
    let phase2 = 0;

    for (let i = 0; i < dur && start + i < totalSamples; i++) {
      const t = i / sr;
      const normT = i / dur;

      // 2020s Pitch Glide on attack
      const glideFreq = targetFreq * (1 + 0.18 * Math.exp(-t * 28));
      phase1 += (2 * Math.PI * glideFreq) / sr;
      phase2 += (2 * Math.PI * glideFreq * 1.006) / sr; // Stereo detune for Reese/Automotivo width

      let env;
      let rawBass;
      if (genreCfg.bassStyle === 'reverse_donk') {
        // Authentic Jumpstyle Reverse-Bass swell + Donk FM harmonic!
        env = Math.sin(Math.PI * Math.pow(normT, 0.72));
        const donkFm = Math.sin(phase1 * 3.0) * Math.exp(-t * 16) * 1.4;
        rawBass = Math.sin(phase1 + donkFm);
      } else if (genreCfg.bassStyle === 'reese_808') {
        env = Math.min(1, t / 0.012) * Math.exp(-t * 3.8);
        const saw1 = 2 * ((phase1 / (2 * Math.PI)) % 1) - 1;
        const saw2 = 2 * ((phase2 / (2 * Math.PI)) % 1) - 1;
        rawBass = Math.sin(phase1) * 0.75 + (saw1 + saw2) * 0.22;
      } else {
        // 2020s Brazilian Automotivo / Spinz 808 Sub-Bass with rich upper harmonics (audible on phone speakers too!)
        env = Math.min(1, t / 0.008) * Math.exp(-t * 4.2);
        rawBass =
          Math.sin(phase1) * 0.82 +
          Math.sin(phase1 * 2) * 0.34 +
          Math.sin(phase1 * 3) * 0.16;
      }

      const sc = sidechainEnv[start + i];
      const sat = softClip(rawBass * moodCfg.drive * 1.45, 1.4) * env * sc * 0.56;
      left[start + i] += sat * 0.98;
      right[start + i] += sat * 1.02;
    }
  }

  // --- 3. SIGNATURE LEAD MELODIES (808 COWBELL / BRAZILIAN TUIM / FAVELA HORN / RAGE SAW / SUPERSAW) ---
  const leadBaseMidi = rootMidi + 24; // 2 octaves above sub-bass for crystal-clear hook separation
  const delaySamples = Math.floor(stepSamples * 3); // Dotted-8th stereo echo

  for (let step = 0; step < totalSteps; step++) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const deg = blueprint.melodySteps[s16];
    if (deg === undefined || deg < 0) continue;

    // Climax bars (bars 5-7) add octave layer energy!
    const climaxOctave = bar >= 5 && s16 % 2 === 0 ? 12 : 0;
    const semitone = scale[deg % scale.length];
    const freq = midiToFreq(leadBaseMidi + semitone + climaxOctave);
    const start = step * stepSamples;
    const noteDur = Math.floor(stepSamples * 1.35);

    let p1 = 0;
    let p2 = 0;
    let p3 = 0;

    for (let i = 0; i < noteDur && start + i < totalSamples; i++) {
      const t = i / sr;
      let sampleL = 0;
      let sampleR = 0;

      if (genreCfg.leadStyle === 'cowbell_808' || genreCfg.leadStyle === 'phonk_bell_cowbell') {
        // Authentic Tuned TR-808 Cowbell (1 : 1.481 dual metallic square-saw blend + punch envelope)
        p1 += (2 * Math.PI * freq * 2) / sr;
        p2 += (2 * Math.PI * freq * 2 * 1.481) / sr;
        const sq1 = Math.sin(p1) >= 0 ? 0.65 : -0.65;
        const sq2 = Math.sin(p2) >= 0 ? 0.55 : -0.55;
        const tone = Math.sin(p1) * 0.6 + (sq1 + sq2) * 0.36;
        const env = Math.min(1, t / 0.003) * (0.35 * Math.exp(-t * 32) + 0.65 * Math.exp(-t * 9.5));
        const sig = softClip(tone * 1.4, 1.35) * env * 0.32;
        sampleL = sig * 0.94;
        sampleR = sig * 1.06;
      } else if (genreCfg.leadStyle === 'tuim_brass' || genreCfg.leadStyle === 'favela_horn') {
        // 2020s Brazilian Automotivo Metallic "Tuim" / Baile Horn Stab with pitch bite
        const bite = 1 + 0.09 * Math.exp(-t * 45);
        p1 += (2 * Math.PI * freq * 2 * bite) / sr;
        p2 += (2 * Math.PI * freq * 2.01 * bite) / sr;
        const fm = Math.sin(p1 * 2.0) * (0.9 * Math.exp(-t * 14) + 0.25);
        const brass = Math.sin(p1 + fm) * 0.65 + Math.sin(p2 * 1.5) * 0.25;
        const env = Math.min(1, t / 0.005) * Math.exp(-t * 8.5);
        const sig = softClip(brass * 1.5, 1.3) * env * 0.32;
        sampleL = sig * 1.05;
        sampleR = sig * 0.95;
      } else {
        // Rage Saw / Jumpstyle Euphoric Detuned Supersaw Lead
        p1 += (2 * Math.PI * freq * 2 * 0.992) / sr;
        p2 += (2 * Math.PI * freq * 2) / sr;
        p3 += (2 * Math.PI * freq * 2 * 1.008) / sr;
        const sawA = 2 * ((p1 / (2 * Math.PI)) % 1) - 1;
        const sawB = 2 * ((p2 / (2 * Math.PI)) % 1) - 1;
        const sawC = 2 * ((p3 / (2 * Math.PI)) % 1) - 1;
        const env = Math.min(1, t / 0.008) * Math.exp(-t * 7.2);
        sampleL = softClip((sawA * 0.55 + sawB * 0.45) * env, 1.2) * 0.28;
        sampleR = softClip((sawC * 0.55 + sawB * 0.45) * env, 1.2) * 0.28;
      }

      const introFilter = bar === 0 ? 0.55 : 1.0;
      const sc = 0.35 + 0.65 * sidechainEnv[start + i];
      const finalL = sampleL * introFilter * sc;
      const finalR = sampleR * introFilter * sc;

      left[start + i] += finalL;
      right[start + i] += finalR;

      // Ping-pong dotted-8th atmospheric space echo
      const dIdx = start + i + delaySamples;
      if (dIdx < totalSamples) {
        left[dIdx] += finalR * 0.22;
        right[dIdx] += finalL * 0.26;
      }
    }
  }

  // --- 4. AI VOCALS IN KITS (FULL PRE-DROP HYPE CHANT + BEAT-SYNCED MONTAGEM/PHONK CHOPS!) ---
  if (includeVocals && voxPcm && voxPcm.length > 2000) {
    // Pass A: Full energetic vocal hype phrase leading into Bar 1 Drop & Bar 5 Second Drop
    for (const anchorBar of [0, 4]) {
      const vStart = anchorBar * 16 * stepSamples + 2 * stepSamples;
      const maxLen = Math.min(voxPcm.length, 14 * stepSamples);
      for (let i = 0; i < maxLen && vStart + i < totalSamples; i++) {
        const fade = i < 400 ? i / 400 : i > maxLen - 1200 ? (maxLen - i) / 1200 : 1;
        const sc = 0.45 + 0.55 * sidechainEnv[vStart + i];
        const v = voxPcm[i] * fade * sc * 0.52;
        left[vStart + i] += v * 0.96;
        right[vStart + i] += v * 1.04;
      }
    }

    // Pass B: Rhythmic 16th-note AI Vocal Chop Stutters on Bars 2, 3, 6, 7!
    const sliceLen = Math.min(stepSamples, Math.floor(voxPcm.length / 4));
    const chopPattern = [0, -1, 0, 1, -1, 2, 2, -1, 1, -1, 3, 3, -1, 0, 2, 3];
    for (const bar of [2, 3, 6, 7]) {
      for (let s16 = 0; s16 < 16; s16++) {
        const sliceIdx = chopPattern[s16];
        if (sliceIdx < 0) continue;
        const srcOffset = Math.min(
          voxPcm.length - sliceLen,
          Math.floor((sliceIdx / 4) * Math.max(1, voxPcm.length - sliceLen))
        );
        if (srcOffset < 0) continue;
        const dstStart = (bar * 16 + s16) * stepSamples;
        const gateLen = Math.floor(stepSamples * 0.82);
        for (let i = 0; i < gateLen && i < sliceLen && dstStart + i < totalSamples; i++) {
          const env = i < 180 ? i / 180 : i > gateLen - 350 ? (gateLen - i) / 350 : 1;
          const sc = 0.4 + 0.6 * sidechainEnv[dstStart + i];
          const pan = s16 % 2 === 0 ? 0.88 : 1.12;
          const v = voxPcm[srcOffset + i] * env * sc * 0.48;
          left[dstStart + i] += v * pan;
          right[dstStart + i] += v * (2 - pan);
        }
      }
    }
  }

  // --- 5. MASTER BUS LIMITER & 16-BIT STEREO WAV ENCODING ---
  const fadeOutSamples = Math.floor(sr * 0.45);
  const pcmBuf = Buffer.alloc(44 + totalSamples * 4);

  // RIFF WAVE Header
  pcmBuf.write('RIFF', 0);
  pcmBuf.writeUInt32LE(36 + totalSamples * 4, 4);
  pcmBuf.write('WAVE', 8);
  pcmBuf.write('fmt ', 12);
  pcmBuf.writeUInt32LE(16, 16);
  pcmBuf.writeUInt16LE(1, 20); // PCM
  pcmBuf.writeUInt16LE(2, 22); // Stereo
  pcmBuf.writeUInt32LE(sr, 24);
  pcmBuf.writeUInt32LE(sr * 4, 28);
  pcmBuf.writeUInt16LE(4, 32);
  pcmBuf.writeUInt16LE(16, 34);
  pcmBuf.write('data', 36);
  pcmBuf.writeUInt32LE(totalSamples * 4, 40);

  for (let i = 0; i < totalSamples; i++) {
    const tailFade = i > totalSamples - fadeOutSamples ? (totalSamples - i) / fadeOutSamples : 1.0;
    const l = Math.tanh(left[i] * 1.18) * 0.96 * tailFade;
    const r = Math.tanh(right[i] * 1.18) * 0.96 * tailFade;
    pcmBuf.writeInt16LE(Math.round(clamp(l, -1, 1) * 32767), 44 + i * 4);
    pcmBuf.writeInt16LE(Math.round(clamp(r, -1, 1) * 32767), 44 + i * 4 + 2);
  }

  const ffmpeg = getFfmpegPath();
  const tmpWavPath = outMp3Path.replace(/\.mp3$/i, '.wav');
  fs.writeFileSync(tmpWavPath, pcmBuf);

  try {
    const args = ['-y', '-i', tmpWavPath];
    if (albumCoverPath && fs.existsSync(albumCoverPath)) {
      args.push('-i', albumCoverPath, '-map', '0:a', '-map', '1:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic');
    }
    args.push(
      '-c:a', 'libmp3lame',
      '-b:a', '320k',
      '-ar', '44100',
      '-id3v2_version', '3',
      '-metadata', `title=${blueprint.title}`,
      '-metadata', `artist=TEXMEX-MD // AI Phonk Studio`,
      '-metadata', `album=${blueprint.album}`,
      '-metadata', `genre=${blueprint.genreLabel}`,
      '-metadata', `TBPM=${blueprint.bpm}`,
      outMp3Path
    );
    await execFileAsync(ffmpeg, args, { timeout: 25000 });
  } finally {
    try { fs.unlinkSync(tmpWavPath); } catch {}
  }

  return {
    durationSec: Number((totalSamples / sr).toFixed(2))
  };
}

/**
 * Fetch & color-grade a 1280x720 HD Anime Background Theme matching the generated track/album.
 */
export async function generateAnimeVisualizerTheme({ blueprint, outThemePath, outHudOverlayPath }) {
  const sharp = await getSharp();
  const moodCfg = PHONK_MOODS[blueprint.mood];
  let rawImgBuf = null;

  // 1. Try Safebooru tag-matched HD anime scene (rating:general)
  try {
    const normalizedTags = String(blueprint.animeTag || 'cyberpunk night').replace(/\+/g, ' ').trim();
    const tagQuery = encodeURIComponent(`${normalizedTags} -swimsuit -bikini -underwear -cleavage rating:general`);
    const sbRes = await axios.get(
      `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=15&tags=${tagQuery}`,
      { timeout: 4500 }
    );
    if (Array.isArray(sbRes.data) && sbRes.data.length > 0) {
      // Prefer widescreen / landscape HD posts when available
      const landscape = sbRes.data.filter((p) => Number(p.width) >= Number(p.height) && p.sample_url);
      const pool = landscape.length ? landscape : sbRes.data.filter((p) => p.sample_url || p.file_url);
      if (pool.length > 0) {
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const imgUrl = chosen.sample_url || chosen.file_url;
        const fullUrl = imgUrl.startsWith('http') ? imgUrl : `https:${imgUrl}`;
        const imgResp = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 6000 });
        if (imgResp.data?.byteLength > 8000) rawImgBuf = Buffer.from(imgResp.data);
      }
    }
  } catch {
    // try next source
  }

  // 2. Fallback: pic.re high-res anime wallpaper API
  if (!rawImgBuf) {
    try {
      const meta = await axios.get('https://pic.re/image.json', { timeout: 4500 });
      const fileUrl = meta.data?.file_url;
      if (fileUrl) {
        const fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`;
        const imgResp = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 6000 });
        if (imgResp.data?.byteLength > 8000) rawImgBuf = Buffer.from(imgResp.data);
      }
    } catch {
      // try next source
    }
  }

  // 3. Fallback: nekos.best anime illustration
  if (!rawImgBuf) {
    try {
      const nb = await axios.get('https://nekos.best/api/v2/kitsune', { timeout: 4500 });
      const imgUrl = nb.data?.results?.[0]?.url;
      if (imgUrl) {
        const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 5500 });
        if (imgResp.data?.byteLength > 8000) rawImgBuf = Buffer.from(imgResp.data);
      }
    } catch {
      // fall back to local Anime AI Bot DP
    }
  }

  // 4. Guaranteed offline fallback: local Anime AI Bot DP
  if (!rawImgBuf) {
    const localDp = path.resolve(process.cwd(), 'public', 'bot-dp.png');
    const localJpg = path.resolve(process.cwd(), 'public', 'bot-dp.jpg');
    rawImgBuf = fs.readFileSync(fs.existsSync(localDp) ? localDp : localJpg);
  }

  if (!sharp) {
    fs.writeFileSync(outThemePath, rawImgBuf);
    return outThemePath;
  }

  // Atmospheric mood vignette & neon rim for the downloadable Anime Background Theme (1280x720)
  const themeAtmosSvg = Buffer.from(`
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="vig" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="${moodCfg.primaryHex}" stop-opacity="0.06"/>
          <stop offset="65%" stop-color="#050811" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="#020409" stop-opacity="0.82"/>
        </radialGradient>
        <linearGradient id="btm" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#030710" stop-opacity="0.48"/>
          <stop offset="35%" stop-color="#030710" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#030710" stop-opacity="0.86"/>
        </linearGradient>
        <linearGradient id="rim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${moodCfg.primaryHex}"/>
          <stop offset="100%" stop-color="${moodCfg.secondaryHex}"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#vig)"/>
      <rect width="1280" height="720" fill="url(#btm)"/>
      <rect x="18" y="18" width="1244" height="684" rx="22" fill="none" stroke="url(#rim)" stroke-opacity="0.48" stroke-width="2.5"/>
    </svg>
  `);

  await sharp(rawImgBuf)
    .resize(1280, 720, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.92, saturation: 1.25 })
    .composite([{ input: themeAtmosSvg }])
    .jpeg({ quality: 92 })
    .toFile(outThemePath);

  // Also generate transparent 1280x720 HUD Title Overlay PNG for the rendered MP4 Visualizer
  if (outHudOverlayPath) {
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const hudSvg = Buffer.from(`
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hudGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${moodCfg.primaryHex}"/>
            <stop offset="100%" stop-color="${moodCfg.secondaryHex}"/>
          </linearGradient>
          <linearGradient id="topShade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#030710" stop-opacity="0.78"/>
            <stop offset="100%" stop-color="#030710" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1280" height="210" fill="url(#topShade)"/>
        <!-- Top Studio Telemetry Pill -->
        <rect x="46" y="38" width="470" height="40" rx="20" fill="#050b14" fill-opacity="0.82" stroke="url(#hudGrad)" stroke-width="2"/>
        <text x="68" y="64" fill="${moodCfg.primaryHex}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="16" font-weight="bold" letter-spacing="2">TEXMEX-MD // AI PHONK STUDIO</text>

        <!-- BPM & Genre Badge Top-Right -->
        <rect x="860" y="38" width="374" height="40" rx="20" fill="#050b14" fill-opacity="0.82" stroke="${moodCfg.secondaryHex}" stroke-width="1.8"/>
        <text x="1047" y="64" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans Mono, monospace" font-size="16" font-weight="bold">${esc(`${blueprint.bpm} BPM · ${PHONK_GENRES[blueprint.genre].shortLabel.toUpperCase()}`)}</text>

        <!-- Track Title & Album Header -->
        <text x="52" y="132" fill="#ffffff" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="42" font-weight="bold" letter-spacing="1.5">${esc(blueprint.title)}</text>
        <text x="54" y="166" fill="${moodCfg.secondaryHex}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="19" font-weight="bold" letter-spacing="2">${esc(`${blueprint.album}  ·  MOOD: ${blueprint.moodLabel.toUpperCase()}`)}</text>

        <!-- Visualizer Stage Frame -->
        <rect x="64" y="420" width="1152" height="232" rx="20" fill="#040812" fill-opacity="0.54" stroke="url(#hudGrad)" stroke-opacity="0.44" stroke-width="1.8"/>

        <!-- Bottom Brand Footer -->
        <text x="640" y="688" text-anchor="middle" fill="#cbd5e1" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.5">Developed by TEXMEX with ♥  ·  https://temex-md.onrender.com/</text>
      </svg>
    `);

    await sharp(hudSvg).png().toFile(outHudOverlayPath);
  }

  return outThemePath;
}

/**
 * Render consistent 1280x720 H.264/AAC MP4 Visualizer using the EXACT rendered MP3 and Anime Theme JPG.
 */
export async function renderConsistentVisualizerMp4({
  mp3Path,
  themePath,
  hudOverlayPath,
  blueprint,
  outMp4Path
}) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    throw new Error('FFmpeg binary unavailable for MP4 visualizer rendering.');
  }
  const moodCfg = PHONK_MOODS[blueprint.mood];

  const filterComplex =
    `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=rgba[bg];` +
    `[bg][2:v]overlay=0:0[bghud];` +
    `[1:a]showfreqs=s=1112x148:mode=bar:ascale=cbrt:fscale=log:win_size=2048:colors=${moodCfg.ffmpegColors},format=rgba,colorkey=0x000000:0.06:0.14[bars];` +
    `[1:a]showwaves=s=1112x58:mode=p2p:rate=24:colors=${moodCfg.waveColors},format=rgba,colorkey=0x000000:0.06:0.14[wave];` +
    `[bghud][bars]overlay=84:492:shortest=1[v1];` +
    `[v1][wave]overlay=84:428:shortest=1,format=yuv420p[vout]`;

  await execFileAsync(
    ffmpeg,
    [
      '-y',
      '-loop', '1', '-i', themePath,
      '-i', mp3Path,
      '-loop', '1', '-i', hudOverlayPath,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '25',
      '-maxrate', '2600k',
      '-bufsize', '5200k',
      '-r', '24',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-shortest',
      outMp4Path
    ],
    { timeout: 60000 }
  );

  return outMp4Path;
}

/**
 * Full End-to-End Studio Pipeline:
 * 1) AI Prompt Enhancement (BPM, Genre, Mood, Prompt -> Melody, 2020s Bass, AI Vocals, Anime Theme)
 * 2) Matching HD Anime Visualizer Theme Artwork (theme.jpg)
 * 3) Mastered 320kbps Stereo MP3 (track.mp3) with AI Vocals & Embedded Anime Album Art
 * 4) Consistent Rendered 1280x720 MP4 Visualizer Video (visualizer.mp4) using the exact same MP3 & Anime Theme!
 */
export async function generatePhonkStudioBundle({
  prompt = '',
  bpm,
  genre = 'brazilian_funk',
  mood = 'energetic',
  includeVocals = true,
  customVocals = ''
} = {}) {
  const trackId = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const trackDir = path.join(STUDIO_ROOT, trackId);
  fs.mkdirSync(trackDir, { recursive: true });

  // 1. AI Prompt & Arrangement Enhancement
  const blueprint = await enhancePromptWithAi({
    prompt,
    bpm,
    genre,
    mood,
    customVocals
  });

  const slug = blueprint.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `texmex-phonk-${blueprint.bpm}`;

  const themePath = path.join(trackDir, 'theme.jpg');
  const hudOverlayPath = path.join(trackDir, 'hud.png');
  const mp3Path = path.join(trackDir, 'track.mp3');
  const mp4Path = path.join(trackDir, 'visualizer.mp4');
  const metaPath = path.join(trackDir, 'meta.json');

  // 2. Run Anime Theme Artwork + AI Vocal Synthesis concurrently for blazing speed!
  const genreCfg = PHONK_GENRES[blueprint.genre];
  const [, voxPcm] = await Promise.all([
    generateAnimeVisualizerTheme({
      blueprint,
      outThemePath: themePath,
      outHudOverlayPath: hudOverlayPath
    }),
    includeVocals ? synthesizeAiVocalPcm(blueprint.vocalScript, genreCfg) : Promise.resolve(null)
  ]);

  // 3. Synthesize Mastered Stereo MP3 with embedded Anime Album Cover
  const audioInfo = await renderMasterAudio({
    blueprint,
    voxPcm,
    includeVocals,
    outMp3Path: mp3Path,
    albumCoverPath: themePath
  });

  // 4. Render Consistent 1280x720 H.264/AAC MP4 Visualizer from the exact MP3 + Anime Theme
  await renderConsistentVisualizerMp4({
    mp3Path,
    themePath,
    hudOverlayPath,
    blueprint,
    outMp4Path: mp4Path
  });

  // Clean up temporary HUD overlay after MP4 render
  try { fs.unlinkSync(hudOverlayPath); } catch {}

  const moodCfg = PHONK_MOODS[blueprint.mood];
  const meta = {
    trackId,
    slug,
    createdAt: new Date().toISOString(),
    title: blueprint.title,
    album: blueprint.album,
    prompt: prompt || '',
    enhancedPrompt: blueprint.enhancedPrompt,
    bpm: blueprint.bpm,
    genre: blueprint.genre,
    genreLabel: blueprint.genreLabel,
    mood: blueprint.mood,
    moodLabel: blueprint.moodLabel,
    includeVocals: Boolean(includeVocals),
    vocalUsed: Boolean(includeVocals && voxPcm),
    vocalScript: includeVocals ? blueprint.vocalScript : '',
    durationSec: audioInfo.durationSec,
    colors: {
      primary: moodCfg.primaryHex,
      secondary: moodCfg.secondaryHex
    },
    files: {
      mp3Size: fs.statSync(mp3Path).size,
      mp4Size: fs.statSync(mp4Path).size,
      themeSize: fs.statSync(themePath).size
    },
    urls: {
      mp3Stream: `/studio/${trackId}/track.mp3`,
      mp4Stream: `/studio/${trackId}/visualizer.mp4`,
      themeImage: `/studio/${trackId}/theme.jpg`,
      mp3Download: `/api/phonk/download/${trackId}/mp3`,
      mp4Download: `/api/phonk/download/${trackId}/mp4`,
      themeDownload: `/api/phonk/download/${trackId}/theme`
    }
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  pruneOldStudioTracks();

  return {
    ...meta,
    paths: { mp3Path, mp4Path, themePath }
  };
}

export function getStudioTrackPaths(trackId) {
  if (!trackId || !/^[a-z0-9-]+$/i.test(trackId)) return null;
  const trackDir = path.join(STUDIO_ROOT, trackId);
  const metaPath = path.join(trackDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return {
    meta,
    mp3Path: path.join(trackDir, 'track.mp3'),
    mp4Path: path.join(trackDir, 'visualizer.mp4'),
    themePath: path.join(trackDir, 'theme.jpg')
  };
}

function pruneOldStudioTracks(maxKeep = 18) {
  try {
    const entries = fs
      .readdirSync(STUDIO_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const full = path.join(STUDIO_ROOT, d.name);
        return { full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of entries.slice(maxKeep)) {
      fs.rmSync(old.full, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}
