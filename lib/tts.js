import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import axios from 'axios';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import config from '../config.js';
import { hasFfmpeg } from './env.js';
import { logger } from './logger.js';

export const VOICE_PRESETS = {
  andrew: {
    id: 'andrew',
    edgeVoice: 'en-US-AndrewMultilingualNeural',
    tiktokVoice: 'en_us_006',
    lang: 'en',
    label: 'Andrew (Warm Studio Narrator · US)'
  },
  aria: {
    id: 'aria',
    edgeVoice: 'en-US-AriaNeural',
    tiktokVoice: 'en_us_001',
    lang: 'en',
    label: 'Aria (Expressive Female · US)'
  },
  chilemba: {
    id: 'chilemba',
    edgeVoice: 'en-KE-ChilembaNeural',
    tiktokVoice: 'en_uk_001',
    lang: 'en',
    label: 'Chilemba (Kenyan Male Neural · KE)'
  },
  asilia: {
    id: 'asilia',
    edgeVoice: 'en-KE-AsiliaNeural',
    tiktokVoice: 'en_us_001',
    lang: 'en',
    label: 'Asilia (Kenyan Female Neural · KE)'
  },
  ryan: {
    id: 'ryan',
    edgeVoice: 'en-GB-RyanNeural',
    tiktokVoice: 'en_uk_001',
    lang: 'en',
    label: 'Ryan (Deep British Studio · UK)'
  },
  swahili: {
    id: 'swahili',
    edgeVoice: 'sw-KE-RafikiNeural',
    tiktokVoice: 'en_uk_001',
    lang: 'sw',
    label: 'Rafiki (Kiswahili Neural · KE)'
  }
};

/**
 * Convert Mathematical Sans-Bold & Small-Caps Unicode back into plain ASCII
 * and expand Bible references ("John 3:16" -> "John chapter 3, verse 16")
 * so AI Neural TTS reads generated cards smoothly and naturally.
 */
export function cleanTextForSpeech(raw = '') {
  let out = '';
  for (const ch of String(raw || '')) {
    const cp = ch.codePointAt(0);
    // Mathematical Sans-Serif Bold Upper (𝗔-𝗭)
    if (cp >= 0x1d5d4 && cp <= 0x1d5ed) {
      out += String.fromCharCode(65 + (cp - 0x1d5d4));
    } else if (cp >= 0x1d5ee && cp <= 0x1d607) {
      // Lower (𝗮-𝘇)
      out += String.fromCharCode(97 + (cp - 0x1d5ee));
    } else if (cp >= 0x1d7ec && cp <= 0x1d7f5) {
      // Digits (𝟬-𝟵)
      out += String.fromCharCode(48 + (cp - 0x1d7ec));
    } else {
      out += ch;
    }
  }

  // Remove HUD borders, footers, URLs, and Markdown formatting symbols
  out = out
    .replace(/┏[^\n]*\n?/g, '')
    .replace(/┗[^\n]*\n?/g, '')
    .replace(/^┃\s?/gm, '')
    .replace(/_?📚\s*Extracted via[^\n]*/gi, '')
    .replace(/💡\s*_?Send\s+\.[a-z]+[^\n]*/gi, '')
    .replace(/Developed by TEXMEX[^\n]*/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_~`#⟁⟦⟧⟪⟫━▸]/g, ' ')
    // Remove emojis/pictographs so TTS doesn't read emoji names aloud
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, ' ');

  // Expand numbered books ("1 John" -> "First John", "2 Timothy" -> "Second Timothy", "3 John" -> "Third John")
  out = out
    .replace(/\b1\s+(Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)\b/gi, 'First $1')
    .replace(/\b2\s+(Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)\b/gi, 'Second $1')
    .replace(/\b3\s+(John)\b/gi, 'Third $1');

  // Expand chapter:verse ranges ("John 3:16-17" -> "John chapter 3, verses 16 to 17", "Psalm 23:1" -> "Psalm chapter 23, verse 1")
  out = out
    .replace(/\b([A-Za-z]+)\s+(\d+):(\d+)[–-](\d+)\b/g, '$1 chapter $2, verses $3 to $4')
    .replace(/\b([A-Za-z]+)\s+(\d+):(\d+)\b/g, '$1 chapter $2, verse $3')
    .replace(/\((ESV|NIV|NKJV|KJV|WEB|NLT)\)/gi, '');

  return out
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 1800);
}

function splitIntoChunks(text, maxLen = 220) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((cur + ' ' + trimmed).trim().length <= maxLen) {
      cur = (cur + ' ' + trimmed).trim();
    } else {
      if (cur) chunks.push(cur);
      if (trimmed.length <= maxLen) {
        cur = trimmed;
      } else {
        // Hard split very long clause on spaces
        const words = trimmed.split(/\s+/);
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).trim().length <= maxLen) {
            sub = (sub + ' ' + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        cur = sub;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * Mirror 1: Microsoft Edge Neural Read-Aloud TTS (Studio-quality MP3)
 */
async function synthesizeWithEdgeNeural(text, edgeVoice) {
  const tts = new MsEdgeTTS();
  // Escape XML special characters so Edge SSML envelope never drops long passages
  const xmlSafeText = String(text || '')
    .replace(/&/g, ' and ')
    .replace(/[<>"']/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  try {
    await tts.setMetadata(
      edgeVoice,
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    );
    const { audioStream } = tts.toStream(xmlSafeText);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Edge TTS timeout')), 22000);
      audioStream.on('data', (d) => chunks.push(d));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const buf = Buffer.concat(chunks);
    if (buf.length < 512) throw new Error('Edge TTS returned empty buffer');
    return buf;
  } finally {
    try {
      tts.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Mirror 2: TikTok Neural Voice Synthesis
 */
async function synthesizeWithTikTokNeural(text, tiktokVoice = 'en_us_006') {
  const parts = splitIntoChunks(text, 230);
  const buffers = [];
  for (const part of parts) {
    const { data } = await axios.post(
      'https://tiktok-tts.weilnet.workers.dev/api/generation',
      { text: part, voice: tiktokVoice },
      { timeout: 12000 }
    );
    if (!data?.data) throw new Error('TikTok TTS missing audio payload');
    buffers.push(Buffer.from(data.data, 'base64'));
  }
  const out = Buffer.concat(buffers);
  if (out.length < 512) throw new Error('TikTok TTS empty buffer');
  return out;
}

/**
 * Mirror 3: Google Translate Multi-Chunk TTS Fallback
 */
async function synthesizeWithGoogleTts(text, lang = 'en') {
  const parts = splitIntoChunks(text, 180);
  const buffers = [];
  for (const part of parts) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      part
    )}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
    const { data } = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    buffers.push(Buffer.from(data));
  }
  const out = Buffer.concat(buffers);
  if (out.length < 256) throw new Error('Google TTS empty buffer');
  return out;
}

/**
 * Optional OpenAI Neural TTS if OPENAI_API_KEY is configured
 */
async function synthesizeWithOpenAi(text, voiceKey = 'andrew') {
  if (!config.openAiKey) return null;
  const openAiVoice = voiceKey === 'aria' || voiceKey === 'asilia' ? 'nova' : 'onyx';
  const { data } = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: 'tts-1',
      voice: openAiVoice,
      input: text.slice(0, 4000),
      response_format: 'mp3'
    },
    {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${config.openAiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return Buffer.from(data);
}

/**
 * Optionally convert MP3 buffer to OGG/Opus when ffmpeg is installed (for native WhatsApp PTT waveform).
 */
function tryConvertMp3ToOpus(mp3Buffer) {
  if (!hasFfmpeg()) return null;
  const tmpId = `texmex-tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(os.tmpdir(), `${tmpId}.mp3`);
  const outPath = path.join(os.tmpdir(), `${tmpId}.ogg`);
  try {
    fs.writeFileSync(inPath, mp3Buffer);
    execFileSync(
      'ffmpeg',
      ['-y', '-i', inPath, '-c:a', 'libopus', '-b:a', '48k', '-vn', outPath],
      { stdio: 'ignore', timeout: 15000 }
    );
    return fs.readFileSync(outPath);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
}

/**
 * Main AI TTS Synthesizer: cleans generated text (Bible verses, prayers, quotes, AI replies)
 * and returns a ready-to-listen audio buffer + WhatsApp-ready mimetype.
 */
export async function generateSpeechAudio(rawText, { voice = 'andrew', preferOpusPtt = false } = {}) {
  const preset = VOICE_PRESETS[String(voice || '').toLowerCase()] || VOICE_PRESETS.andrew;
  const spokenText = cleanTextForSpeech(rawText);
  if (!spokenText) {
    throw new Error('No speakable text found to synthesize.');
  }

  let mp3Buffer = null;
  let engine = 'Edge Neural AI';

  // 0. Optional OpenAI TTS if key set
  if (config.openAiKey) {
    try {
      mp3Buffer = await synthesizeWithOpenAi(spokenText, preset.id);
      engine = 'OpenAI Neural TTS';
    } catch {
      mp3Buffer = null;
    }
  }

  // 1. Microsoft Edge Neural TTS
  if (!mp3Buffer) {
    try {
      mp3Buffer = await synthesizeWithEdgeNeural(spokenText, preset.edgeVoice);
      engine = `Edge Neural (${preset.id})`;
    } catch (err) {
      logger.warn('TTS', `Edge Neural fallback -> TikTok/Google: ${err.message}`);
    }
  }

  // 2. TikTok Neural TTS
  if (!mp3Buffer && preset.lang === 'en') {
    try {
      mp3Buffer = await synthesizeWithTikTokNeural(spokenText, preset.tiktokVoice);
      engine = 'TikTok Neural TTS';
    } catch {
      // Fall through to Google TTS
    }
  }

  // 3. Google Multi-Chunk TTS
  if (!mp3Buffer) {
    mp3Buffer = await synthesizeWithGoogleTts(spokenText, preset.lang);
    engine = 'Google Neural TTS';
  }

  if (preferOpusPtt) {
    const opusBuf = tryConvertMp3ToOpus(mp3Buffer);
    if (opusBuf) {
      return {
        buffer: opusBuf,
        mp3Buffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        spokenText,
        voice: preset.id,
        voiceLabel: preset.label,
        engine
      };
    }
  }

  return {
    buffer: mp3Buffer,
    mp3Buffer,
    mimetype: 'audio/mpeg',
    ptt: false,
    spokenText,
    voice: preset.id,
    voiceLabel: preset.label,
    engine
  };
}

/**
 * Helper to send ready-to-listen AI speech directly into a WhatsApp chat.
 */
export async function sendReadyVoiceToChat(sock, chatJid, rawText, { quoted, voice = 'andrew', title = 'TEXMEX-MD AI VOICE' } = {}) {
  const ttsRes = await generateSpeechAudio(rawText, { voice, preferOpusPtt: true });
  await sock.sendMessage(
    chatJid,
    {
      audio: ttsRes.buffer,
      mimetype: ttsRes.mimetype,
      ptt: ttsRes.ptt,
      fileName: `${title.replace(/[^a-z0-9_-]+/gi, '_')}.mp3`
    },
    quoted ? { quoted } : undefined
  );
  return ttsRes;
}
