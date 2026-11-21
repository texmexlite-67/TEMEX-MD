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

export const MIN_PRODUCTION_SECONDS = 160;
export const DEFAULT_PRODUCTION_SECONDS = 168;

export const PHONK_GENRES = {
  brazilian_funk: {
    id: 'brazilian_funk',
    label: 'Brazilian Funk 2020s (Automotivo / No Batidão)',
    shortLabel: 'Brazilian Funk 2020s',
    defaultBpm: 130,
    minBpm: 115,
    maxBpm: 148,
    rootMidi: 31, // G1 (49 Hz club sub)
    primaryVoice: 'pt-BR-FranciscaNeural',
    altEdgeVoice: 'pt-BR-AntonioNeural',
    tiktokVoice: 'br_005',
    vocalStyle: 'montagem',
    leadStyle: 'tuim_brass',
    bassStyle: 'automotivo_sub',
    defaultChant: 'Vai! Toma! No batidão!',
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
    primaryVoice: 'en-US-GuyNeural',
    altEdgeVoice: 'en-US-AndrewMultilingualNeural',
    tiktokVoice: 'en_us_006',
    vocalStyle: 'memphis_dark',
    leadStyle: 'cowbell_808',
    bassStyle: 'distorted_808',
    defaultChant: 'Full throttle! Drift night!',
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
    primaryVoice: 'en-US-AndrewMultilingualNeural',
    altEdgeVoice: 'en-US-GuyNeural',
    tiktokVoice: 'en_us_ghostface',
    vocalStyle: 'memphis_dark',
    leadStyle: 'phonk_bell_cowbell',
    bassStyle: 'reese_808',
    defaultChant: 'Shadow syndicate! Drop the bass!',
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
    primaryVoice: 'pt-BR-AntonioNeural',
    altEdgeVoice: 'pt-BR-FranciscaNeural',
    tiktokVoice: 'br_005',
    vocalStyle: 'favela_mc',
    leadStyle: 'favela_horn',
    bassStyle: 'favela_bounce',
    defaultChant: 'Solta o tamborzão! Vai!',
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
    primaryVoice: 'en-US-AvaMultilingualNeural',
    altEdgeVoice: 'en-US-GuyNeural',
    tiktokVoice: 'en_us_006',
    vocalStyle: 'trap_hype',
    leadStyle: 'rage_saw',
    bassStyle: 'spinz_808',
    defaultChant: 'Turn the vault up! Go!',
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
    primaryVoice: 'en-US-AriaNeural',
    altEdgeVoice: 'en-US-AvaMultilingualNeural',
    tiktokVoice: 'en_us_001',
    vocalStyle: 'rave_jump',
    leadStyle: 'supersaw_rave',
    bassStyle: 'reverse_donk',
    defaultChant: 'Jump! Feel the bass!',
    kickSteps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.78],
    snareSteps: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.92, 0, 0, 0],
    hatSteps: [0.4, 0, 0.95, 0, 0.4, 0, 0.95, 0, 0.4, 0, 0.95, 0, 0.4, 0.6, 0.98, 0.75],
    percSteps: [0, 0, 0.85, 0, 0, 0, 0.85, 0, 0, 0, 0.85, 0, 0, 0, 0.9, 0],
    animeTags: ['headphones colorful', 'cyberpunk neon', 'concert']
  }
};

export const PHONK_MOODS = {
  hypnotic: {
    id: 'hypnotic',
    label: 'Hypnotic / Trance Batidão',
    scale: [0, 1, 3, 5, 7, 8, 11], // Hypnotic Phrygian-Harmonic Hybrid
    drive: 1.38,
    primaryHex: '#00f5d4',
    secondaryHex: '#9b5de5',
    ffmpegColors: '#00f5d4|#9b5de5',
    waveColors: '#9b5de5|#00f5d4'
  },
  energetic: {
    id: 'energetic',
    label: 'Energetic / High-Octane',
    scale: [0, 1, 4, 5, 7, 8, 10], // Phrygian Dominant
    drive: 1.35,
    primaryHex: '#00f5a0',
    secondaryHex: '#00d9f5',
    ffmpegColors: '#00f5a0|#00d9f5',
    waveColors: '#00d9f5|#00f5a0'
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive / Hard Overdrive',
    scale: [0, 1, 3, 5, 7, 8, 10], // Dark Phrygian
    drive: 1.65,
    primaryHex: '#ff2a5f',
    secondaryHex: '#ff9e00',
    ffmpegColors: '#ff2a5f|#ff9e00',
    waveColors: '#ff9e00|#ff2a5f'
  },
  dark: {
    id: 'dark',
    label: 'Dark Midnight / Shadow',
    scale: [0, 1, 3, 5, 6, 8, 10], // Locrian / Dark Phonk
    drive: 1.45,
    primaryHex: '#b5179e',
    secondaryHex: '#ff2a85',
    ffmpegColors: '#b5179e|#ff2a85',
    waveColors: '#ff2a85|#b5179e'
  },
  drift: {
    id: 'drift',
    label: 'Street Drift / Nightrunner',
    scale: [0, 2, 3, 5, 7, 8, 11], // Harmonic Minor
    drive: 1.5,
    primaryHex: '#ff2a85',
    secondaryHex: '#00f0ff',
    ffmpegColors: '#ff2a85|#00f0ff',
    waveColors: '#00f0ff|#ff2a85'
  },
  favela_heat: {
    id: 'favela_heat',
    label: 'Brazilian Favela Heat',
    scale: [0, 1, 3, 5, 7, 8, 10],
    drive: 1.4,
    primaryHex: '#ffd60a',
    secondaryHex: '#00f5a0',
    ffmpegColors: '#ffd60a|#00f5a0',
    waveColors: '#00f5a0|#ffd60a'
  },
  euphoric: {
    id: 'euphoric',
    label: 'Euphoric Rave / Cyber',
    scale: [0, 2, 3, 5, 7, 8, 10], // Natural Minor
    drive: 1.28,
    primaryHex: '#00e5ff',
    secondaryHex: '#ffbe0b',
    ffmpegColors: '#00e5ff|#ffbe0b',
    waveColors: '#ffbe0b|#00e5ff'
  }
};

export const PHONK_TYPES = {
  no_batidao_cd: {
    id: 'no_batidao_cd',
    label: 'CD Clean / YouTube No Batidão Style',
    bitCrushLevels: 0,
    downsampleHold: 1,
    masterDrive: 1.15
  },
  crushed: {
    id: 'crushed',
    label: 'Crushed (Bitcrushed Krushclub / Hard Grit)',
    bitCrushLevels: 28, // Crunchy 2020s Krushclub / Crushed Phonk quantization!
    downsampleHold: 3,  // Classic ~14.7kHz sizzle aliasing bite
    masterDrive: 1.55
  },
  automotivo: {
    id: 'automotivo',
    label: 'Automotivo (Heavy 2020s Car-Sub Overdrive)',
    bitCrushLevels: 0,
    downsampleHold: 1,
    masterDrive: 1.42
  },
  memphis_tape: {
    id: 'memphis_tape',
    label: 'Memphis Tape (Lo-Fi Analog Cassette Saturation)',
    bitCrushLevels: 96,
    downsampleHold: 2,
    masterDrive: 1.32
  }
};

export const PHONK_EFFECTS = {
  none: {
    id: 'none',
    label: 'Original CD Master (No Speed Warp)',
    speedFactor: 1.0,
    ffmpegFilter: 'highpass=f=24,acompressor=threshold=-12dB:ratio=3:makeup=2'
  },
  slowed: {
    id: 'slowed',
    label: 'Slowed + Reverb (0.84× Pitch/Tempo + Lush Hall)',
    speedFactor: 0.84, // Stretches duration by ~1.19x with deep pitched-down analog tape vibe!
    ffmpegFilter:
      'asetrate=44100*0.84,aresample=44100,aecho=0.85:0.82:65|130:0.26|0.18,lowpass=f=13500,acompressor=threshold=-12dB:ratio=3:makeup=2.5'
  },
  sped_up: {
    id: 'sped_up',
    label: 'Sped Up / Nightcore (1.14× High-Octane)',
    speedFactor: 1.14,
    ffmpegFilter:
      'asetrate=44100*1.14,aresample=44100,acompressor=threshold=-12dB:ratio=3:makeup=2'
  },
  bass_boost: {
    id: 'bass_boost',
    label: 'Extreme Sub-Bass Boost (+6dB 52Hz Punch)',
    speedFactor: 1.0,
    ffmpegFilter:
      'equalizer=f=52:t=q:w=1.1:g=6,acompressor=threshold=-11dB:ratio=3.5:makeup=2.5'
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
  if (s.includes('drift') || s.includes('cowbell')) return 'drift_phonk';
  if (s.includes('brazil') || s.includes('funk') || s.includes('automotivo') || s.includes('montagem') || s.includes('batidao')) {
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
  if (!s) return 'hypnotic';
  if (s.includes('hypno') || s.includes('trance') || s.includes('batidao')) return 'hypnotic';
  if (s.includes('aggress') || s.includes('hard') || s.includes('rage')) return 'aggressive';
  if (s.includes('dark') || s.includes('shadow') || s.includes('night')) return 'dark';
  if (s.includes('drift') || s.includes('race')) return 'drift';
  if (s.includes('favela') || s.includes('party') || s.includes('brazil') || s.includes('heat')) return 'favela_heat';
  if (s.includes('euphor') || s.includes('rave') || s.includes('cyber')) return 'euphoric';
  if (s.includes('energ')) return 'energetic';
  return PHONK_MOODS[s] ? s : 'energetic';
}

export function normalizeType(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return 'no_batidao_cd';
  if (s.includes('crush') || s.includes('krush') || s.includes('bit')) return 'crushed';
  if (s.includes('auto') || s.includes('car')) return 'automotivo';
  if (s.includes('tape') || s.includes('memphis') || s.includes('lofi')) return 'memphis_tape';
  return PHONK_TYPES[s] ? s : 'no_batidao_cd';
}

export function normalizeEffect(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return 'none';
  if (s.includes('slow') || s.includes('reverb')) return 'slowed';
  if (s.includes('sped') || s.includes('speed') || s.includes('nightcore') || s.includes('fast')) return 'sped_up';
  if (s.includes('bass')) return 'bass_boost';
  return PHONK_EFFECTS[s] ? s : 'none';
}

function hashSeed(text) {
  return crypto.createHash('sha256').update(String(text || 'texmex')).digest();
}

function buildFallbackBlueprint({ prompt, bpm, genreKey, moodKey, typeKey, effectKey, customVocals }) {
  const genre = PHONK_GENRES[genreKey];
  const mood = PHONK_MOODS[moodKey];
  const seed = hashSeed(`${prompt}|${bpm}|${genreKey}|${moodKey}|${typeKey}`);

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

  const motifA = [...(baseMotifs[genreKey] || baseMotifs.brazilian_funk)];
  if (moodKey === 'hypnotic') {
    // Mesmerizing repeating minor-second "No Batidão" hypnotic ostinato!
    motifA.splice(0, 16, 0, 1, 0, -1, 0, 1, 3, 1, 0, 1, 0, -1, 4, 3, 1, 0);
  } else {
    for (let i = 2; i < 16; i += 3) {
      if (motifA[i] >= 0 && (seed[i] % 3 === 0)) {
        motifA[i] = (motifA[i] + (seed[i + 4] % 3)) % mood.scale.length;
      }
    }
  }

  // Build Variation B melody for Climax Drop & Counter-Hooks across the 160s+ full song!
  const motifB = motifA.map((deg, idx) => {
    if (deg < 0) return idx % 4 === 2 ? 0 : -1;
    return (deg + (idx % 2 === 0 ? 2 : 0)) % mood.scale.length;
  });

  const words = String(prompt || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => w.toUpperCase());

  const titlePrefix =
    genreKey === 'brazilian_funk'
      ? 'NO BATIDAO'
      : genreKey === 'favela'
        ? 'BAILE FAVELA'
        : genreKey === 'drift_phonk'
          ? 'DRIFT OVERDRIVE'
          : genreKey === 'jumpstyle'
            ? 'KRUSH JUMP'
            : genreKey === 'trap'
              ? 'RAGE VAULT'
              : 'HYPNOTIC PHONK';

  const effectSuffix = effectKey === 'slowed' ? ' (SLOWED + REVERB)' : typeKey === 'crushed' ? ' (CRUSHED)' : '';
  const baseTitle = (words.length ? `${titlePrefix}: ${words.join(' ')}` : `${titlePrefix} ${bpm}`).slice(0, 32);
  const title = `${baseTitle}${effectSuffix}`;
  const album = `TEXMEX-MD // ${genre.shortLabel.toUpperCase()} CD`;

  return {
    title: title.slice(0, 52),
    album: album.slice(0, 44),
    enhancedPrompt:
      `Full-length CD-mastered ${bpm} BPM ${genre.label} (${PHONK_TYPES[typeKey].label}, ${PHONK_EFFECTS[effectKey].label}) ` +
      `in ${mood.label} mood — multi-act 165s+ arrangement with 2020s bass melodies, YouTube No Batidão formant hooks, ` +
      `and ${prompt || 'cyberpunk midnight anime energy'}.`,
    vocalScript: (customVocals || genre.defaultChant).slice(0, 48),
    melodySteps: motifA,
    melodyStepsB: motifB,
    bassSteps: [...(baseBass[genreKey] || baseBass.brazilian_funk)],
    animeTag: genre.animeTags[seed[0] % genre.animeTags.length]
  };
}

/**
 * Use AI to upgrade Prompt, BPM, Genre, Mood, Type & Effect into a full 160s+ Studio Blueprint.
 */
export async function enhancePromptWithAi({
  prompt = '',
  bpm = 130,
  genre = 'brazilian_funk',
  mood = 'hypnotic',
  type = 'no_batidao_cd',
  effect = 'none',
  customVocals = ''
}) {
  const genreKey = normalizeGenre(genre);
  const moodKey = normalizeMood(mood);
  const typeKey = normalizeType(type);
  const effectKey = normalizeEffect(effect);
  const genreCfg = PHONK_GENRES[genreKey];
  const safeBpm = clamp(Number(bpm) || genreCfg.defaultBpm, 85, 195);

  const fallback = buildFallbackBlueprint({
    prompt,
    bpm: safeBpm,
    genreKey,
    moodKey,
    typeKey,
    effectKey,
    customVocals
  });

  const aiInstruction =
    `You are an elite 2020s Brazilian Funk ("No Batidão" / Automotivo), Drift Phonk, Favela, Trap & Krushclub producer.\n` +
    `Enhance this track request into a single-line JSON studio blueprint.\n` +
    `User Prompt: "${prompt || 'Hypnotic YouTube No Batidão club anthem with heavy 2020s bass melody'}"\n` +
    `Genre: ${genreCfg.label} | BPM: ${safeBpm} | Mood: ${PHONK_MOODS[moodKey].label} | Type: ${PHONK_TYPES[typeKey].label} | Effect: ${PHONK_EFFECTS[effectKey].label}\n` +
    `IMPORTANT FOR VOCALS: vocalScript MUST be ultra-short (2 to 5 punchy rhythmic words MAX, e.g. "Vai! No batidão!" or "Drift the night!") so it locks tightly to 1 bar.\n` +
    `Respond ONLY with valid JSON matching:\n` +
    `{"title":"UPPERCASE TRACK TITLE (max 34 chars)","album":"UPPERCASE ALBUM NAME (max 36 chars)","enhancedPrompt":"1 vivid sentence improving audio & anime visual direction","vocalScript":"2-5 punchy rhythmic hype words","melodySteps":[16 integers from -1 to 6],"animeTag":"2 safebooru tags separated by space like cyberpunk night"}`;

  try {
    const raw = await Promise.race([
      askTexmexAi(aiInstruction, { useMemory: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('ai-timeout')), 6000))
    ]);
    const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title) {
        const baseT = String(parsed.title).toUpperCase().slice(0, 32);
        const sfx = effectKey === 'slowed' && !baseT.includes('SLOW') ? ' (SLOWED)' : '';
        fallback.title = `${baseT}${sfx}`;
      }
      if (parsed.album) fallback.album = String(parsed.album).toUpperCase().slice(0, 44);
      if (parsed.enhancedPrompt) fallback.enhancedPrompt = String(parsed.enhancedPrompt).slice(0, 260);
      if (!customVocals && parsed.vocalScript) {
        // Keep vocal chant short & rhythmic (max 6 words) so it never drifts off-beat
        const words = String(parsed.vocalScript).replace(/["<>]/g, '').trim().split(/\s+/).slice(0, 6);
        if (words.length >= 1) fallback.vocalScript = words.join(' ').slice(0, 48);
      }
      if (Array.isArray(parsed.melodySteps) && parsed.melodySteps.length === 16) {
        fallback.melodySteps = parsed.melodySteps.map((n) => {
          const v = Number(n);
          return Number.isFinite(v) ? clamp(Math.round(v), -1, 6) : -1;
        });
        fallback.melodyStepsB = fallback.melodySteps.map((deg, idx) =>
          deg < 0 ? (idx % 4 === 2 ? 0 : -1) : (deg + (idx % 2 === 0 ? 2 : 0)) % PHONK_MOODS[moodKey].scale.length
        );
      }
      if (parsed.animeTag && /^[a-z0-9_\s+]+$/i.test(parsed.animeTag)) {
        fallback.animeTag = parsed.animeTag.replace(/\+/g, ' ').toLowerCase().trim();
      }
    }
  } catch {
    // Deterministic studio blueprint already ready
  }

  return {
    ...fallback,
    bpm: safeBpm,
    genre: genreKey,
    genreLabel: genreCfg.label,
    mood: moodKey,
    moodLabel: PHONK_MOODS[moodKey].label,
    type: typeKey,
    typeLabel: PHONK_TYPES[typeKey].label,
    effect: effectKey,
    effectLabel: PHONK_EFFECTS[effectKey].label
  };
}

/**
 * Raw Vocal Generator Candidate 1: Microsoft Edge HD Neural Voice
 */
async function generateEdgeVocalMp3(script, voiceName) {
  let tts = null;
  try {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(script);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge-vox-timeout')), 7500);
      audioStream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      audioStream.on('end', () => { clearTimeout(timer); resolve(); });
      audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const buf = Buffer.concat(chunks);
    return buf.length > 600 ? buf : null;
  } finally {
    try { tts?.close?.(); } catch {}
  }
}

/**
 * Raw Vocal Generator Candidate 2 (Alternative Best Vocal Engine): TikTok Studio Neural Voice
 */
async function generateTikTokVocalMp3(script, tiktokVoice = 'en_us_006') {
  const res = await axios.post(
    'https://tiktok-tts.weilnet.workers.dev/api/generation',
    { text: script.slice(0, 120), voice: tiktokVoice },
    { timeout: 6500 }
  );
  const b64 = res.data?.data;
  if (!b64 || typeof b64 !== 'string') return null;
  const buf = Buffer.from(b64, 'base64');
  return buf.length > 600 ? buf : null;
}

/**
 * Decode MP3 vocal candidate, time-lock it to the exact BPM bar grid, and compute a strict
 * Beat-Alignment Quality Score (0.00 - 1.00).
 * If alignment is poor (< 0.78), caller either forces the alternative vocal generator OR
 * ignores bad vocals completely in favor of CD-Quality YouTube "No Batidão" Instrumental style!
 */
async function decodeAndScoreVocalAlignment({ mp3Buf, bpm, genreCfg, engineName }) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg || !mp3Buf) return null;

  const sr = 44100;
  const barSec = (60 / bpm) * 4;
  const tmpId = crypto.randomBytes(5).toString('hex');
  const mp3Path = path.join(STUDIO_ROOT, `vox-${tmpId}.mp3`);
  const rawPath = path.join(STUDIO_ROOT, `vox-${tmpId}.s16le`);

  try {
    fs.writeFileSync(mp3Path, mp3Buf);

    // Step 1: Trim leading/trailing silence cleanly
    let af =
      'silenceremove=start_periods=1:start_threshold=-38dB:stop_periods=-1:stop_duration=0.12:stop_threshold=-40dB,' +
      'highpass=f=200,lowpass=f=5400,acompressor=threshold=-16dB:ratio=4.5:makeup=4';
    if (genreCfg.vocalStyle === 'memphis_dark') {
      af += ',asetrate=24000*0.90,aresample=44100';
    } else {
      af += ',aresample=44100';
    }

    await execFileAsync(
      ffmpeg,
      ['-y', '-i', mp3Path, '-af', af, '-f', 's16le', '-ac', '1', '-ar', String(sr), rawPath],
      { timeout: 10000 }
    );

    const rawBuf = fs.readFileSync(rawPath);
    const rawLen = Math.floor(rawBuf.length / 2);
    const rawDurSec = rawLen / sr;

    // Reject empty, clipped, or rambling sentences (> 1.45 bars cannot lock cleanly without artifacts)
    if (rawDurSec < 0.22 || rawDurSec > barSec * 1.45) {
      return { aligned: false, score: 0.35, reason: `duration ${rawDurSec.toFixed(2)}s outside rhythmic bar window`, engineName };
    }

    // Snap vocal phrase cleanly to nearest 0.5-bar or 1.0-bar rhythmic slot
    const targetDurSec = rawDurSec <= barSec * 0.62 ? barSec * 0.5 : barSec * 0.92;
    const stretchRatio = rawDurSec / targetDurSec;

    // If required tempo warp is extreme (<0.76x or >1.32x), vocals will sound unnatural/unaligned -> reject!
    if (stretchRatio < 0.76 || stretchRatio > 1.32) {
      return { aligned: false, score: 0.48, reason: `tempo warp ${stretchRatio.toFixed(2)}x too extreme`, engineName };
    }

    const targetSamples = Math.floor(targetDurSec * sr);
    const samples = new Float32Array(targetSamples);
    let peak = 0.01;
    let rmsSum = 0;

    // Resample onto exact beat-locked sample count with linear interpolation
    for (let i = 0; i < targetSamples; i++) {
      const srcPos = (i / targetSamples) * (rawLen - 1);
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const s0 = rawBuf.readInt16LE(idx * 2) / 32768;
      const s1 = rawBuf.readInt16LE(Math.min(rawLen - 1, idx + 1) * 2) / 32768;
      const v = s0 + (s1 - s0) * frac;
      samples[i] = v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
      rmsSum += v * v;
    }

    const rms = Math.sqrt(rmsSum / targetSamples);
    if (rms < 0.015) {
      return { aligned: false, score: 0.3, reason: 'low vocal energy', engineName };
    }

    // Normalize & check transient onset alignment on 16th-note grid
    const norm = 0.88 / peak;
    const stepSamples = Math.floor((60 / bpm / 4) * sr);
    let gridHits = 0;
    let totalChecks = 0;

    for (let i = 0; i < targetSamples; i++) {
      samples[i] *= norm;
    }

    for (let st = 0; st < Math.floor(targetSamples / stepSamples); st++) {
      totalChecks++;
      const winStart = st * stepSamples;
      const winEnd = Math.min(targetSamples, winStart + Math.floor(stepSamples * 0.35));
      let e = 0;
      for (let k = winStart; k < winEnd; k++) e += Math.abs(samples[k]);
      e /= Math.max(1, winEnd - winStart);
      if (e > 0.06) gridHits++;
    }

    const warpPenalty = Math.abs(1 - stretchRatio) * 0.45;
    const gridRatio = totalChecks > 0 ? gridHits / totalChecks : 0.5;
    const score = clamp(0.68 + gridRatio * 0.36 - warpPenalty, 0, 0.99);

    return {
      aligned: score >= 0.78,
      score: Number(score.toFixed(2)),
      samples,
      engineName
    };
  } catch (err) {
    return { aligned: false, score: 0, reason: err.message, engineName };
  } finally {
    try { fs.unlinkSync(mp3Path); } catch {}
    try { fs.unlinkSync(rawPath); } catch {}
  }
}

/**
 * Smart Multi-Engine Vocal Resolver:
 * 1) If vocalMode === 'cd_no_batidao' or includeVocals === false -> Pure YouTube "No Batidão" CD Instrumental
 * 2) Tries Best Neural Engine -> checks Beat-Grid Alignment Score
 * 3) If unaligned or degraded -> Forces Alternative Best Vocal Engine (TikTok Studio Neural + Alt Edge Voice)
 * 4) If STILL unaligned -> Ignores bad vocals completely and switches to YouTube "No Batidão" CD Instrumental!
 */
async function resolveAlignedVocalsOrNoBatidao({
  vocalScript,
  bpm,
  genreCfg,
  includeVocals = true,
  vocalMode = 'auto_aligned'
}) {
  if (!includeVocals || vocalMode === 'cd_no_batidao') {
    return {
      useVocals: false,
      noBatidaoInstrumental: true,
      modeUsed: 'CD Instrumental (YouTube No Batidão Style)',
      alignmentScore: null,
      pcm: null
    };
  }

  const cleanScript = String(vocalScript || genreCfg.defaultChant)
    .replace(/&/g, ' and ')
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates = [
    {
      name: `Edge HD Neural (${genreCfg.primaryVoice})`,
      fn: () => generateEdgeVocalMp3(cleanScript, genreCfg.primaryVoice)
    },
    {
      name: `TikTok Studio Neural (${genreCfg.tiktokVoice})`,
      fn: () => generateTikTokVocalMp3(cleanScript, genreCfg.tiktokVoice)
    },
    {
      name: `Alternative Neural (${genreCfg.altEdgeVoice})`,
      fn: () => generateEdgeVocalMp3(cleanScript, genreCfg.altEdgeVoice)
    }
  ];

  // If user explicitly forced alternative vocal engine first, put Alternative engines at front!
  if (vocalMode === 'force_alt_vocal') {
    candidates.unshift(candidates.splice(1, 1)[0]);
  }

  let bestAttempt = null;
  for (const cand of candidates) {
    try {
      const mp3Buf = await cand.fn();
      if (!mp3Buf) continue;
      const checked = await decodeAndScoreVocalAlignment({
        mp3Buf,
        bpm,
        genreCfg,
        engineName: cand.name
      });
      if (!checked) continue;
      if (!bestAttempt || checked.score > bestAttempt.score) bestAttempt = checked;
      if (checked.aligned) {
        logger.info('PHONK-VOX', `Aligned vocals locked via ${cand.name} (score ${checked.score})`);
        return {
          useVocals: true,
          noBatidaoInstrumental: false,
          modeUsed: `${cand.name} · Beat-Aligned (${Math.round(checked.score * 100)}%)`,
          alignmentScore: checked.score,
          pcm: checked.samples
        };
      }
      logger.warn(
        'PHONK-VOX',
        `${cand.name} alignment score ${checked.score} below threshold (${checked.reason || 'off-grid'}) — forcing alternative engine...`
      );
    } catch {
      // try next alternative vocal generator
    }
  }

  // Automatic protection: IGNORE unaligned/bad vocals & activate CD-quality YouTube "No Batidão" Instrumental!
  logger.info(
    'PHONK-VOX',
    `Bad/unaligned vocals ignored (best score ${bestAttempt?.score ?? 0}) -> Switched to CD Instrumental (YouTube No Batidão Style)`
  );
  return {
    useVocals: false,
    noBatidaoInstrumental: true,
    modeUsed: 'CD Instrumental — YouTube No Batidão Style (Unaligned Vocals Ignored)',
    alignmentScore: bestAttempt?.score ?? 0,
    pcm: null
  };
}

/**
 * Pre-synthesize high-precision kit & melodic instrument buffers so a full 160s-220s multi-act
 * commercial song renders in < 450ms!
 */
function buildInstrumentBank({ sr, stepSamples, genreCfg, moodCfg, blueprint }) {
  const noiseLen = 32768;
  const noise = new Float32Array(noiseLen);
  let lfsr = 0x2468ace1;
  for (let i = 0; i < noiseLen; i++) {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    noise[i] = ((lfsr & 0xffff) / 32768) - 1.0;
  }

  // 1. Kick One-Shot + Sidechain Curve
  const kickLen = Math.floor(sr * (blueprint.genre === 'jumpstyle' ? 0.30 : 0.24));
  const kickBuf = new Float32Array(kickLen);
  const duckCurve = new Float32Array(kickLen);
  let kp = 0;
  for (let i = 0; i < kickLen; i++) {
    const t = i / sr;
    const f = 46 + 142 * Math.exp(-t * 36);
    kp += (2 * Math.PI * f) / sr;
    const env = Math.exp(-t * 10.2);
    const click = t < 0.008 ? noise[i % noiseLen] * (1 - t / 0.008) * 0.55 : 0;
    kickBuf[i] = softClip((Math.sin(kp) * 1.38 + click) * env, 1.55) * 0.8;
    duckCurve[i] = 0.72 * Math.exp(-t * 15);
  }

  // 2. Snare / Tamborzão Caixa One-Shot
  const snareLen = Math.floor(sr * 0.17);
  const snareBuf = new Float32Array(snareLen);
  let sp = 0;
  const bodyFreq = ['brazilian_funk', 'favela'].includes(blueprint.genre) ? 236 : 192;
  for (let i = 0; i < snareLen; i++) {
    const t = i / sr;
    sp += (2 * Math.PI * bodyFreq * Math.exp(-t * 8)) / sr;
    const body = Math.sin(sp) * Math.exp(-t * 22) * 0.55;
    const snap = noise[(i * 3) % noiseLen] * Math.exp(-t * 19) * 0.75;
    snareBuf[i] = softClip(body + snap, 1.35) * 0.54;
  }

  // 3. Closed & Open Hi-Hats
  const cHatLen = Math.floor(sr * 0.045);
  const cHatBuf = new Float32Array(cHatLen);
  for (let i = 0; i < cHatLen; i++) {
    const t = i / sr;
    cHatBuf[i] = (noise[i % noiseLen] - noise[(i + 1) % noiseLen]) * Math.exp(-t * 65) * 0.22;
  }
  const oHatLen = Math.floor(sr * 0.14);
  const oHatBuf = new Float32Array(oHatLen);
  for (let i = 0; i < oHatLen; i++) {
    const t = i / sr;
    oHatBuf[i] = (noise[i % noiseLen] - noise[(i + 1) % noiseLen]) * Math.exp(-t * 18) * 0.22;
  }

  // 4. Dual-Tone Brazilian Agogô / Perc One-Shots
  const percLen = Math.floor(sr * 0.11);
  const makePerc = (freq) => {
    const b = new Float32Array(percLen);
    let pp = 0;
    for (let i = 0; i < percLen; i++) {
      const t = i / sr;
      pp += (2 * Math.PI * freq) / sr;
      b[i] = Math.sin(pp + 0.65 * Math.sin(pp * 2.41)) * Math.exp(-t * 28) * 0.25;
    }
    return b;
  };
  const percLo = makePerc(blueprint.genre === 'favela' ? 320 : 680);
  const percHi = makePerc(blueprint.genre === 'favela' ? 480 : 860);

  // 5. Pre-compute Bass, Lead & "No Batidão" Vocal-Formant Synth Notes across 2 Octaves
  const scale = moodCfg.scale;
  const rootMidi = genreCfg.rootMidi;
  const bassDur = Math.floor(stepSamples * (genreCfg.bassStyle === 'reverse_donk' ? 1.05 : 1.85));
  const leadDur = Math.floor(stepSamples * 1.35);
  const formantDur = Math.floor(stepSamples * 0.92);

  const bassNotes = new Map();
  const leadNotes = new Map();
  const formantNotes = new Map(); // Signature YouTube "No Batidão" Formant Vocal-Synth Hook!

  for (let oct = 0; oct <= 1; oct++) {
    for (let d = 0; d < scale.length; d++) {
      const key = `${d}_${oct}`;
      const semi = scale[d] + oct * 12;

      // Bass Buffer
      const bFreq = midiToFreq(rootMidi + semi);
      const bArr = new Float32Array(bassDur);
      let bp1 = 0, bp2 = 0;
      for (let i = 0; i < bassDur; i++) {
        const t = i / sr;
        const normT = i / bassDur;
        const gf = bFreq * (1 + 0.18 * Math.exp(-t * 28));
        bp1 += (2 * Math.PI * gf) / sr;
        bp2 += (2 * Math.PI * gf * 1.006) / sr;
        let env, rawB;
        if (genreCfg.bassStyle === 'reverse_donk') {
          env = Math.sin(Math.PI * Math.pow(normT, 0.72));
          rawB = Math.sin(bp1 + Math.sin(bp1 * 3.0) * Math.exp(-t * 16) * 1.4);
        } else if (genreCfg.bassStyle === 'reese_808') {
          env = Math.min(1, t / 0.012) * Math.exp(-t * 3.8);
          const s1 = 2 * ((bp1 / (2 * Math.PI)) % 1) - 1;
          const s2 = 2 * ((bp2 / (2 * Math.PI)) % 1) - 1;
          rawB = Math.sin(bp1) * 0.75 + (s1 + s2) * 0.22;
        } else {
          env = Math.min(1, t / 0.008) * Math.exp(-t * 4.1);
          rawB = Math.sin(bp1) * 0.82 + Math.sin(bp1 * 2) * 0.35 + Math.sin(bp1 * 3) * 0.17;
        }
        bArr[i] = softClip(rawB * moodCfg.drive * 1.45, 1.4) * env * 0.56;
      }
      bassNotes.set(key, bArr);

      // Lead Buffer (Cowbell / Brazilian Tuim / Favela Horn / Supersaw)
      const lFreq = midiToFreq(rootMidi + 24 + semi);
      const lArrL = new Float32Array(leadDur);
      const lArrR = new Float32Array(leadDur);
      let lp1 = 0, lp2 = 0, lp3 = 0;
      for (let i = 0; i < leadDur; i++) {
        const t = i / sr;
        if (genreCfg.leadStyle === 'cowbell_808' || genreCfg.leadStyle === 'phonk_bell_cowbell') {
          lp1 += (2 * Math.PI * lFreq * 2) / sr;
          lp2 += (2 * Math.PI * lFreq * 2 * 1.481) / sr;
          const sq1 = Math.sin(lp1) >= 0 ? 0.65 : -0.65;
          const sq2 = Math.sin(lp2) >= 0 ? 0.55 : -0.55;
          const env = Math.min(1, t / 0.003) * (0.35 * Math.exp(-t * 32) + 0.65 * Math.exp(-t * 9.5));
          const sig = softClip((Math.sin(lp1) * 0.6 + (sq1 + sq2) * 0.36) * 1.4, 1.35) * env * 0.32;
          lArrL[i] = sig * 0.94;
          lArrR[i] = sig * 1.06;
        } else if (genreCfg.leadStyle === 'tuim_brass' || genreCfg.leadStyle === 'favela_horn') {
          const bite = 1 + 0.09 * Math.exp(-t * 45);
          lp1 += (2 * Math.PI * lFreq * 2 * bite) / sr;
          lp2 += (2 * Math.PI * lFreq * 2.01 * bite) / sr;
          const fm = Math.sin(lp1 * 2.0) * (0.9 * Math.exp(-t * 14) + 0.25);
          const env = Math.min(1, t / 0.005) * Math.exp(-t * 8.5);
          const sig = softClip((Math.sin(lp1 + fm) * 0.65 + Math.sin(lp2 * 1.5) * 0.25) * 1.5, 1.3) * env * 0.32;
          lArrL[i] = sig * 1.05;
          lArrR[i] = sig * 0.95;
        } else {
          lp1 += (2 * Math.PI * lFreq * 2 * 0.992) / sr;
          lp2 += (2 * Math.PI * lFreq * 2) / sr;
          lp3 += (2 * Math.PI * lFreq * 2 * 1.008) / sr;
          const sA = 2 * ((lp1 / (2 * Math.PI)) % 1) - 1;
          const sB = 2 * ((lp2 / (2 * Math.PI)) % 1) - 1;
          const sC = 2 * ((lp3 / (2 * Math.PI)) % 1) - 1;
          const env = Math.min(1, t / 0.008) * Math.exp(-t * 7.2);
          lArrL[i] = softClip((sA * 0.55 + sB * 0.45) * env, 1.2) * 0.28;
          lArrR[i] = softClip((sC * 0.55 + sB * 0.45) * env, 1.2) * 0.28;
        }
      }
      leadNotes.set(key, { L: lArrL, R: lArrR });

      // YouTube "No Batidão" Vocal-Formant Choir/Voz Synth Buffer (Ah/Oh vowel harmonics locked to beat!)
      const fFreq = midiToFreq(rootMidi + 12 + semi);
      const fArr = new Float32Array(formantDur);
      const h1 = Math.max(1, Math.round(730 / fFreq));  // Vowel 'Ah' Formant 1 (~730 Hz)
      const h2 = Math.max(2, Math.round(1150 / fFreq)); // Formant 2 (~1150 Hz)
      const h3 = Math.max(3, Math.round(2450 / fFreq)); // Formant 3 (~2450 Hz)
      let fp = 0;
      for (let i = 0; i < formantDur; i++) {
        const t = i / sr;
        const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
        fp += (2 * Math.PI * fFreq * vib) / sr;
        const gateEnv = Math.min(1, t / 0.01) * Math.min(1, (formantDur - i) / 320) * Math.exp(-t * 4.5);
        const voxSynth =
          Math.sin(fp) * 0.45 +
          Math.sin(fp * h1) * 0.48 +
          Math.sin(fp * h2) * 0.30 +
          Math.sin(fp * h3) * 0.14;
        fArr[i] = softClip(voxSynth * 1.45, 1.3) * gateEnv * 0.30;
      }
      formantNotes.set(key, fArr);
    }
  }

  return {
    noise,
    noiseLen,
    kickBuf,
    duckCurve,
    snareBuf,
    cHatBuf,
    oHatBuf,
    percLo,
    percHi,
    bassNotes,
    leadNotes,
    formantNotes
  };
}

/**
 * Render Full-Length (160s - 240s+) 8-Act Multi-Section Song Master + Type ("Crushed") + Effects ("Slowed").
 */
async function renderFullLengthMasterAudio({
  blueprint,
  vocalResolution,
  targetDurationSec = DEFAULT_PRODUCTION_SECONDS,
  outMp3Path,
  albumCoverPath
}) {
  const sr = 44100;
  const genreCfg = PHONK_GENRES[blueprint.genre];
  const moodCfg = PHONK_MOODS[blueprint.mood];
  const typeCfg = PHONK_TYPES[blueprint.type];
  const effectCfg = PHONK_EFFECTS[blueprint.effect];
  const bpm = blueprint.bpm;

  // Enforce >= 160s AFTER speed effects (e.g. if sped_up 1.14x, synthesize more bars so output >= 165s!)
  const desiredFinalSec = Math.max(MIN_PRODUCTION_SECONDS + 5, Number(targetDurationSec) || DEFAULT_PRODUCTION_SECONDS);
  const preEffectSecNeeded = desiredFinalSec * effectCfg.speedFactor;
  const barSec = (60 / bpm) * 4;
  // Round up to clean multiple of 4 bars for musical phrasing
  const bars = Math.max(68, Math.ceil(preEffectSecNeeded / barSec / 4) * 4);
  const totalSteps = bars * 16;
  const stepSamples = Math.floor((60 / bpm / 4) * sr);
  const totalSamples = totalSteps * stepSamples + Math.floor(sr * 0.8);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const sidechainEnv = new Float32Array(totalSamples).fill(1.0);

  const bank = buildInstrumentBank({ sr, stepSamples, genreCfg, moodCfg, blueprint });
  const scaleLen = moodCfg.scale.length;

  // Determine 8-Act Commercial Song Structure across `bars`:
  const getSectionForBar = (bar) => {
    const p = bar / bars;
    if (p < 0.06) return 'intro';        // Filtered No-Batidão Atmos Intro
    if (p < 0.21) return 'verse1';       // Groove A + Bassline
    if (p < 0.26) return 'build1';       // Snare Roll & Riser
    if (p < 0.48) return 'drop1';        // Main Drop 1
    if (p < 0.60) return 'breakdown';    // Hypnotic Half-Time Breakdown / Bridge
    if (p < 0.65) return 'build2';       // Tension Riser 2
    if (p < 0.91) return 'drop2';        // Climax Drop 2 (Octave Lead + Variation B)
    return 'outro';                      // Club Batidão Ride-Out & Fade
  };

  // --- PASS 1: MULTI-SECTION DRUMS, RISERS & SIDECHAIN ENVELOPE ---
  for (let step = 0; step < totalSteps; step++) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const sec = getSectionForBar(bar);
    const start = step * stepSamples;

    // Kick
    let kickVel = genreCfg.kickSteps[s16] || 0;
    if (sec === 'intro') kickVel = s16 === 0 ? 0.55 : 0;
    else if (sec === 'breakdown') kickVel = s16 === 0 || s16 === 8 ? 0.72 : 0;
    else if (sec === 'build1' || sec === 'build2') {
      kickVel = s16 % 2 === 0 ? 0.85 : (bar % 2 === 1 ? 0.92 : 0);
    }

    if (kickVel > 0) {
      const kBuf = bank.kickBuf;
      const dBuf = bank.duckCurve;
      for (let i = 0; i < kBuf.length && start + i < totalSamples; i++) {
        const s = kBuf[i] * kickVel;
        left[start + i] += s;
        right[start + i] += s;
        const duck = 1.0 - dBuf[i] * kickVel;
        if (duck < sidechainEnv[start + i]) sidechainEnv[start + i] = duck;
      }
    }

    // Snare / Caixa
    let snareVel = genreCfg.snareSteps[s16] || 0;
    if (sec === 'intro' || sec === 'outro') snareVel *= 0.35;
    else if (sec === 'breakdown') snareVel = s16 === 8 ? 0.65 : 0;
    else if (sec === 'build1' || sec === 'build2') {
      // Accelerating pre-drop snare roll!
      snareVel = bar % 2 === 1 ? 0.88 : (s16 % 2 === 0 ? 0.75 : 0);
    }
    if (snareVel > 0) {
      const sBuf = bank.snareBuf;
      for (let i = 0; i < sBuf.length && start + i < totalSamples; i++) {
        const s = sBuf[i] * snareVel;
        left[start + i] += s * 0.96;
        right[start + i] += s * 1.04;
      }
    }

    // Hi-Hats
    let hatVel = genreCfg.hatSteps[s16] || 0;
    if (sec === 'intro' || sec === 'breakdown') hatVel *= 0.45;
    if (hatVel > 0) {
      const isOpen = blueprint.genre === 'jumpstyle' && s16 % 4 === 2;
      const hBuf = isOpen ? bank.oHatBuf : bank.cHatBuf;
      const rolls = (sec === 'drop2' && (s16 === 7 || s16 === 15)) ? 2 : 1;
      const rStep = Math.floor(stepSamples / rolls);
      for (let r = 0; r < rolls; r++) {
        const hs = start + r * rStep;
        for (let i = 0; i < hBuf.length && hs + i < totalSamples; i++) {
          const s = hBuf[i] * hatVel;
          left[hs + i] += s * 1.08;
          right[hs + i] += s * 0.92;
        }
      }
    }

    // Brazilian Agogô / Perc
    const percVel = genreCfg.percSteps[s16] || 0;
    if (percVel > 0 && ['verse1', 'drop1', 'drop2', 'outro'].includes(sec)) {
      const pBuf = s16 % 2 === 0 ? bank.percLo : bank.percHi;
      for (let i = 0; i < pBuf.length && start + i < totalSamples; i++) {
        const s = pBuf[i] * percVel;
        left[start + i] += s * 0.88;
        right[start + i] += s * 1.12;
      }
    }
  }

  // --- PASS 2: 2020s BASS MELODIES, LEADS & YOUTUBE "NO BATIDÃO" FORMANT SYNTH ---
  const delaySamples = Math.floor(stepSamples * 3);

  for (let step = 0; step < totalSteps; step++) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const sec = getSectionForBar(bar);
    const start = step * stepSamples;

    // A) 2020s Sub-Bass Melody
    if (sec !== 'build1' && sec !== 'build2') {
      const bassDeg = blueprint.bassSteps[s16];
      if (bassDeg !== undefined && bassDeg >= 0 && !(sec === 'intro' && s16 > 6)) {
        const oct = (sec === 'drop2' && bar % 2 === 1 && s16 >= 12) ? 1 : 0;
        const bBuf = bank.bassNotes.get(`${bassDeg % scaleLen}_${oct}`);
        const secGain = sec === 'intro' ? 0.55 : sec === 'breakdown' ? 0.78 : 1.0;
        if (bBuf) {
          for (let i = 0; i < bBuf.length && start + i < totalSamples; i++) {
            const s = bBuf[i] * secGain * sidechainEnv[start + i];
            left[start + i] += s * 0.98;
            right[start + i] += s * 1.02;
          }
        }
      }
    }

    // B) Primary & Variation B Melodic Hooks
    const useMotifB = sec === 'drop2' || (sec === 'drop1' && bar % 4 >= 2) || sec === 'breakdown';
    const melArr = useMotifB ? blueprint.melodyStepsB : blueprint.melodySteps;
    const melDeg = melArr[s16];

    if (melDeg !== undefined && melDeg >= 0 && sec !== 'outro') {
      const oct = (sec === 'drop2' && s16 % 2 === 0) ? 1 : 0;
      const lNote = bank.leadNotes.get(`${melDeg % scaleLen}_${oct}`);
      const leadGain =
        sec === 'intro' ? 0.48 :
        sec === 'verse1' ? 0.72 :
        sec === 'breakdown' ? 0.65 :
        sec === 'build1' || sec === 'build2' ? 0.60 : 1.0;

      if (lNote) {
        const L = lNote.L, R = lNote.R;
        for (let i = 0; i < L.length && start + i < totalSamples; i++) {
          const sc = 0.35 + 0.65 * sidechainEnv[start + i];
          const fl = L[i] * leadGain * sc;
          const fr = R[i] * leadGain * sc;
          left[start + i] += fl;
          right[start + i] += fr;

          const dIdx = start + i + delaySamples;
          if (dIdx < totalSamples) {
            left[dIdx] += fr * 0.20;
            right[dIdx] += fl * 0.24;
          }
        }
      }
    }

    // C) YouTube "No Batidão" CD Instrumental Formant Choir/Voz Synth Layer!
    // Always active when bad/unaligned vocals are ignored (or in No Batidão CD style) AND on Breakdown/Drop2!
    const playNoBatidaoLayer =
      vocalResolution.noBatidaoInstrumental
        ? ['verse1', 'drop1', 'breakdown', 'drop2'].includes(sec)
        : ['breakdown', 'drop2'].includes(sec);

    if (playNoBatidaoLayer && (s16 % 2 === 0 || s16 === 3 || s16 === 11)) {
      const fDeg = melDeg !== undefined && melDeg >= 0 ? melDeg : 0;
      const fOct = (bar % 2 === 1 && s16 >= 8) ? 1 : 0;
      const fBuf = bank.formantNotes.get(`${fDeg % scaleLen}_${fOct}`);
      if (fBuf) {
        const panL = s16 % 4 === 0 ? 1.12 : 0.88;
        const panR = 2.0 - panL;
        for (let i = 0; i < fBuf.length && start + i < totalSamples; i++) {
          const sc = 0.38 + 0.62 * sidechainEnv[start + i];
          const v = fBuf[i] * sc;
          left[start + i] += v * panL;
          right[start + i] += v * panR;
        }
      }
    }
  }

  // --- PASS 3: BEAT-ALIGNED AI VOCALS (ONLY WHEN ALIGNMENT VERIFIED!) ---
  if (vocalResolution.useVocals && vocalResolution.pcm && vocalResolution.pcm.length > 1000) {
    const vox = vocalResolution.pcm;
    const chopPattern = [0, -1, 0, 1, -1, 2, 2, -1, 1, -1, 3, 3, -1, 0, 2, 3];
    const sliceLen = Math.min(stepSamples, Math.floor(vox.length / 4));

    for (let bar = 0; bar < bars; bar++) {
      const sec = getSectionForBar(bar);
      const barSampleStart = bar * 16 * stepSamples;

      // Full Beat-Locked Vocal Hook on Pre-Drop Builds & Every 8th Drop Bar
      if (sec === 'build1' || sec === 'build2' || ((sec === 'drop1' || sec === 'drop2') && bar % 8 === 0)) {
        const maxLen = Math.min(vox.length, 16 * stepSamples);
        for (let i = 0; i < maxLen && barSampleStart + i < totalSamples; i++) {
          const sc = 0.48 + 0.52 * sidechainEnv[barSampleStart + i];
          const s = vox[i] * sc * 0.50;
          left[barSampleStart + i] += s * 0.96;
          right[barSampleStart + i] += s * 1.04;
        }
      } else if ((sec === 'drop1' || sec === 'drop2') && bar % 4 === 2 && sliceLen > 400) {
        // Tight Beat-Locked 16th-Note Montagem / Phonk Vocal Chop Bar
        for (let s16 = 0; s16 < 16; s16++) {
          const sl = chopPattern[s16];
          if (sl < 0) continue;
          const srcOff = Math.min(vox.length - sliceLen, Math.floor((sl / 4) * Math.max(1, vox.length - sliceLen)));
          const dst = barSampleStart + s16 * stepSamples;
          const gate = Math.floor(stepSamples * 0.80);
          for (let i = 0; i < gate && i < sliceLen && dst + i < totalSamples; i++) {
            const env = i < 160 ? i / 160 : i > gate - 300 ? (gate - i) / 300 : 1;
            const sc = 0.42 + 0.58 * sidechainEnv[dst + i];
            const v = vox[srcOff + i] * env * sc * 0.45;
            left[dst + i] += v * (s16 % 2 === 0 ? 0.9 : 1.1);
            right[dst + i] += v * (s16 % 2 === 0 ? 1.1 : 0.9);
          }
        }
      }
    }
  }

  // --- PASS 4: PRODUCTION TYPE ("CRUSHED" BITCRUSHER / CD MASTER) & STEREO WAV ---
  const fadeInSamples = Math.floor(sr * 1.2);
  const fadeOutSamples = Math.floor(sr * 4.5);
  const pcmBuf = Buffer.alloc(44 + totalSamples * 4);

  pcmBuf.write('RIFF', 0);
  pcmBuf.writeUInt32LE(36 + totalSamples * 4, 4);
  pcmBuf.write('WAVE', 8);
  pcmBuf.write('fmt ', 12);
  pcmBuf.writeUInt32LE(16, 16);
  pcmBuf.writeUInt16LE(1, 20);
  pcmBuf.writeUInt16LE(2, 22);
  pcmBuf.writeUInt32LE(sr, 24);
  pcmBuf.writeUInt32LE(sr * 4, 28);
  pcmBuf.writeUInt16LE(4, 32);
  pcmBuf.writeUInt16LE(16, 34);
  pcmBuf.write('data', 36);
  pcmBuf.writeUInt32LE(totalSamples * 4, 40);

  const crushLevels = typeCfg.bitCrushLevels;
  const holdN = typeCfg.downsampleHold || 1;
  const masterDrive = typeCfg.masterDrive || 1.18;
  let heldL = 0, heldR = 0;

  for (let i = 0; i < totalSamples; i++) {
    const fadeIn = i < fadeInSamples ? i / fadeInSamples : 1.0;
    const fadeOut = i > totalSamples - fadeOutSamples ? (totalSamples - i) / fadeOutSamples : 1.0;
    const env = fadeIn * fadeOut;

    if (i % holdN === 0) {
      let l = Math.tanh(left[i] * masterDrive) * 0.95;
      let r = Math.tanh(right[i] * masterDrive) * 0.95;
      if (crushLevels > 0) {
        l = Math.round(l * crushLevels) / crushLevels;
        r = Math.round(r * crushLevels) / crushLevels;
      }
      heldL = l;
      heldR = r;
    }

    pcmBuf.writeInt16LE(Math.round(clamp(heldL * env, -1, 1) * 32767), 44 + i * 4);
    pcmBuf.writeInt16LE(Math.round(clamp(heldR * env, -1, 1) * 32767), 44 + i * 4 + 2);
  }

  // --- PASS 5: MASTER MP3 ENCODING + STUDIO AUDIO EFFECTS ("SLOWED + REVERB", ETC.) ---
  const ffmpeg = getFfmpegPath();
  const tmpWavPath = outMp3Path.replace(/\.mp3$/i, '.wav');
  fs.writeFileSync(tmpWavPath, pcmBuf);

  try {
    const args = ['-y', '-i', tmpWavPath];
    if (albumCoverPath && fs.existsSync(albumCoverPath)) {
      args.push('-i', albumCoverPath, '-map', '0:a', '-map', '1:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic');
    }
    args.push(
      '-af', effectCfg.ffmpegFilter,
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', '44100',
      '-id3v2_version', '3',
      '-metadata', `title=${blueprint.title}`,
      '-metadata', `artist=TEXMEX-MD // AI Phonk Studio`,
      '-metadata', `album=${blueprint.album}`,
      '-metadata', `genre=${blueprint.genreLabel}`,
      '-metadata', `TBPM=${Math.round(blueprint.bpm * effectCfg.speedFactor)}`,
      outMp3Path
    );
    await execFileAsync(ffmpeg, args, { timeout: 60000 });
  } finally {
    try { fs.unlinkSync(tmpWavPath); } catch {}
  }

  const finalDurationSec = Number(((totalSamples / sr) / effectCfg.speedFactor).toFixed(2));
  return {
    durationSec: finalDurationSec,
    bars
  };
}

/**
 * Fetch & color-grade a 1280x720 HD Anime Background Theme + Pre-composited Stage Backdrop for fast MP4 rendering.
 */
export async function generateAnimeVisualizerTheme({ blueprint, outThemePath, outStagePath }) {
  const sharp = await getSharp();
  const moodCfg = PHONK_MOODS[blueprint.mood];
  let rawImgBuf = null;

  // 1. Safebooru tag-matched clean HD anime scene
  try {
    const normalizedTags = String(blueprint.animeTag || 'cyberpunk night').replace(/\+/g, ' ').trim();
    const tagQuery = encodeURIComponent(`${normalizedTags} -swimsuit -bikini -underwear -cleavage rating:general`);
    const sbRes = await axios.get(
      `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=15&tags=${tagQuery}`,
      { timeout: 4500 }
    );
    if (Array.isArray(sbRes.data) && sbRes.data.length > 0) {
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
  } catch {}

  // 2. Fallback: pic.re HD anime wallpaper
  if (!rawImgBuf) {
    try {
      const meta = await axios.get('https://pic.re/image.json', { timeout: 4500 });
      const fileUrl = meta.data?.file_url;
      if (fileUrl) {
        const fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${fileUrl}`;
        const imgResp = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 6000 });
        if (imgResp.data?.byteLength > 8000) rawImgBuf = Buffer.from(imgResp.data);
      }
    } catch {}
  }

  // 3. Fallback: nekos.best
  if (!rawImgBuf) {
    try {
      const nb = await axios.get('https://nekos.best/api/v2/kitsune', { timeout: 4500 });
      const imgUrl = nb.data?.results?.[0]?.url;
      if (imgUrl) {
        const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 5500 });
        if (imgResp.data?.byteLength > 8000) rawImgBuf = Buffer.from(imgResp.data);
      }
    } catch {}
  }

  // 4. Local Anime AI Bot DP guaranteed fallback
  if (!rawImgBuf) {
    const localDp = path.resolve(process.cwd(), 'public', 'bot-dp.png');
    const localJpg = path.resolve(process.cwd(), 'public', 'bot-dp.jpg');
    rawImgBuf = fs.readFileSync(fs.existsSync(localDp) ? localDp : localJpg);
  }

  if (!sharp) {
    fs.writeFileSync(outThemePath, rawImgBuf);
    if (outStagePath) fs.writeFileSync(outStagePath, rawImgBuf);
    return outThemePath;
  }

  // Clean 1280x720 Anime Background Theme (for downloading as standalone background theme!)
  const themeAtmosSvg = Buffer.from(`
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="vig" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="${moodCfg.primaryHex}" stop-opacity="0.06"/>
          <stop offset="65%" stop-color="#050811" stop-opacity="0.40"/>
          <stop offset="100%" stop-color="#020409" stop-opacity="0.82"/>
        </radialGradient>
        <linearGradient id="btm" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#030710" stop-opacity="0.45"/>
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

  const themeBuf = await sharp(rawImgBuf)
    .resize(1280, 720, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.92, saturation: 1.25 })
    .composite([{ input: themeAtmosSvg }])
    .jpeg({ quality: 92 })
    .toBuffer();

  fs.writeFileSync(outThemePath, themeBuf);

  // Pre-composite 960x540 HUD Stage Image ONCE so 165s+ MP4 renders at ~10x realtime!
  if (outStagePath) {
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const badgeRight = `${blueprint.bpm} BPM · ${PHONK_GENRES[blueprint.genre].shortLabel.toUpperCase()}`;
    const subLine = `${blueprint.album}  ·  ${blueprint.moodLabel.toUpperCase()}  ·  ${PHONK_TYPES[blueprint.type].id.toUpperCase()}${blueprint.effect !== 'none' ? ' · ' + blueprint.effect.toUpperCase() : ''}`;

    const hudSvg = Buffer.from(`
      <svg width="960" height="540" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hudGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${moodCfg.primaryHex}"/>
            <stop offset="100%" stop-color="${moodCfg.secondaryHex}"/>
          </linearGradient>
          <linearGradient id="topShade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#030710" stop-opacity="0.82"/>
            <stop offset="100%" stop-color="#030710" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="960" height="165" fill="url(#topShade)"/>

        <rect x="34" y="28" width="350" height="32" rx="16" fill="#050b14" fill-opacity="0.84" stroke="url(#hudGrad)" stroke-width="1.6"/>
        <text x="52" y="49" fill="${moodCfg.primaryHex}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="12.5" font-weight="bold" letter-spacing="1.6">TEXMEX-MD // AI PHONK STUDIO</text>

        <rect x="620" y="28" width="306" height="32" rx="16" fill="#050b14" fill-opacity="0.84" stroke="${moodCfg.secondaryHex}" stroke-width="1.5"/>
        <text x="773" y="49" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans Mono, monospace" font-size="12.5" font-weight="bold">${esc(badgeRight.slice(0, 34))}</text>

        <text x="38" y="99" fill="#ffffff" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="30" font-weight="bold" letter-spacing="1.2">${esc(blueprint.title)}</text>
        <text x="40" y="125" fill="${moodCfg.secondaryHex}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="13.5" font-weight="bold" letter-spacing="1.4">${esc(subLine.slice(0, 74))}</text>

        <rect x="48" y="314" width="864" height="176" rx="16" fill="#040812" fill-opacity="0.56" stroke="url(#hudGrad)" stroke-opacity="0.44" stroke-width="1.5"/>
        <text x="480" y="516" text-anchor="middle" fill="#cbd5e1" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="12.5" font-weight="bold" letter-spacing="1.2">Developed by TEXMEX with ♥  ·  https://temex-md.onrender.com/</text>
      </svg>
    `);

    await sharp(themeBuf)
      .resize(960, 540, { fit: 'cover' })
      .composite([{ input: hudSvg }])
      .jpeg({ quality: 90 })
      .toFile(outStagePath);
  }

  return outThemePath;
}

/**
 * Render consistent Full-Length (160s+) H.264/AAC MP4 Visualizer using the EXACT rendered MP3 and Anime Theme Stage.
 */
export async function renderConsistentVisualizerMp4({
  mp3Path,
  stagePath,
  blueprint,
  outMp4Path
}) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) throw new Error('FFmpeg binary unavailable for MP4 visualizer rendering.');
  const moodCfg = PHONK_MOODS[blueprint.mood];

  const filterComplex =
    `[1:a]showfreqs=s=832x112:mode=bar:rate=15:ascale=cbrt:fscale=log:win_size=1024:colors=${moodCfg.ffmpegColors},format=rgba,colorkey=0x000000:0.06:0.14[bars];` +
    `[1:a]showwaves=s=832x44:mode=p2p:rate=15:colors=${moodCfg.waveColors},format=rgba,colorkey=0x000000:0.06:0.14[wave];` +
    `[0:v][bars]overlay=64:368:shortest=1[v1];` +
    `[v1][wave]overlay=64:320:shortest=1,format=yuv420p[vout]`;

  await execFileAsync(
    ffmpeg,
    [
      '-y',
      '-loop', '1', '-framerate', '15', '-i', stagePath,
      '-i', mp3Path,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '1:a',
      '-threads', '0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '31',
      '-maxrate', '520k',
      '-bufsize', '1040k',
      '-r', '15',
      '-g', '60',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-shortest',
      outMp4Path
    ],
    { timeout: 120000 }
  );

  return outMp4Path;
}

/**
 * Full End-to-End 160s+ Commercial Studio Pipeline:
 * 1) AI Prompt Enhancement (BPM, Genre, Mood [incl. Hypnotic], Type [incl. Crushed], Effect [incl. Slowed])
 * 2) Multi-Engine Vocal Alignment Check (or auto-ignore -> YouTube "No Batidão" CD Instrumental!)
 * 3) Matching 1280x720 HD Anime Visualizer Theme (theme.jpg)
 * 4) Full-Length 160s+ Mastered Stereo MP3 (track.mp3) with Type ("Crushed") & Effects ("Slowed")
 * 5) Consistent Full-Length MP4 Visualizer Video (visualizer.mp4) using the exact same MP3 & Anime Theme!
 */
export async function generatePhonkStudioBundle({
  prompt = '',
  bpm,
  genre = 'brazilian_funk',
  mood = 'hypnotic',
  type = 'no_batidao_cd',
  effect = 'none',
  durationSec = DEFAULT_PRODUCTION_SECONDS,
  includeVocals = true,
  vocalMode = 'auto_aligned',
  customVocals = ''
} = {}) {
  const trackId = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const trackDir = path.join(STUDIO_ROOT, trackId);
  fs.mkdirSync(trackDir, { recursive: true });

  const safeTargetDuration = clamp(
    Number(durationSec) || DEFAULT_PRODUCTION_SECONDS,
    MIN_PRODUCTION_SECONDS,
    260
  );

  const blueprint = await enhancePromptWithAi({
    prompt,
    bpm,
    genre,
    mood,
    type,
    effect,
    customVocals
  });

  const slug = blueprint.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `texmex-phonk-${blueprint.bpm}`;

  const themePath = path.join(trackDir, 'theme.jpg');
  const stagePath = path.join(trackDir, 'stage.jpg');
  const mp3Path = path.join(trackDir, 'track.mp3');
  const mp4Path = path.join(trackDir, 'visualizer.mp4');
  const metaPath = path.join(trackDir, 'meta.json');

  const genreCfg = PHONK_GENRES[blueprint.genre];

  // Run Anime Theme Artwork + Smart Vocal Alignment / Alternative Vocal Resolver in parallel!
  const [, vocalResolution] = await Promise.all([
    generateAnimeVisualizerTheme({
      blueprint,
      outThemePath: themePath,
      outStagePath: stagePath
    }),
    resolveAlignedVocalsOrNoBatidao({
      vocalScript: blueprint.vocalScript,
      bpm: blueprint.bpm,
      genreCfg,
      includeVocals,
      vocalMode
    })
  ]);

  // Synthesize Full 160s+ Song Master MP3 (including Crushed type & Slowed effect)
  const audioInfo = await renderFullLengthMasterAudio({
    blueprint,
    vocalResolution,
    targetDurationSec: safeTargetDuration,
    outMp3Path: mp3Path,
    albumCoverPath: themePath
  });

  // Render Consistent Full-Length MP4 Visualizer from the EXACT rendered MP3 + Anime Theme Stage
  await renderConsistentVisualizerMp4({
    mp3Path,
    stagePath,
    blueprint,
    outMp4Path: mp4Path
  });

  try { fs.unlinkSync(stagePath); } catch {}

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
    effectiveBpm: Math.round(blueprint.bpm * PHONK_EFFECTS[blueprint.effect].speedFactor),
    genre: blueprint.genre,
    genreLabel: blueprint.genreLabel,
    mood: blueprint.mood,
    moodLabel: blueprint.moodLabel,
    type: blueprint.type,
    typeLabel: blueprint.typeLabel,
    effect: blueprint.effect,
    effectLabel: blueprint.effectLabel,
    includeVocals: Boolean(includeVocals),
    vocalUsed: vocalResolution.useVocals,
    noBatidaoInstrumental: vocalResolution.noBatidaoInstrumental,
    vocalModeUsed: vocalResolution.modeUsed,
    vocalAlignmentScore: vocalResolution.alignmentScore,
    vocalScript: vocalResolution.useVocals ? blueprint.vocalScript : '',
    durationSec: audioInfo.durationSec,
    bars: audioInfo.bars,
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

function pruneOldStudioTracks(maxKeep = 10) {
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
  } catch {}
}
