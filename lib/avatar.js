import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import config from '../config.js';
import { getSharp, hasFfmpeg } from './env.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const DP_PNG_PATH = path.join(PUBLIC_DIR, 'bot-dp.png');
const DP_JPG_PATH = path.join(PUBLIC_DIR, 'bot-dp.jpg');
const DP_THUMB_PATH = path.join(PUBLIC_DIR, 'bot-dp-thumb.jpg');

let cachedRemoteDp = null;

/**
 * Retrieve the TEXMEX-MD Anime AI Bot DP buffer.
 * Supports custom BOT_DP_URL override or built-in public/bot-dp.{jpg,png}.
 * @param {'standard'|'hd'|'thumb'} variant
 */
export async function getBotDpBuffer(variant = 'standard') {
  if (config.botDpUrl) {
    if (cachedRemoteDp) return cachedRemoteDp;
    try {
      const { data } = await axios.get(config.botDpUrl, {
        responseType: 'arraybuffer',
        timeout: 12000
      });
      cachedRemoteDp = Buffer.from(data);
      return cachedRemoteDp;
    } catch (err) {
      logger.warn('BOTDP', `Failed fetching BOT_DP_URL (${err.message}); using built-in Anime AI DP.`);
    }
  }

  // Check custom runtime DP saved in dataDir first
  const customDpPath = path.join(config.dataDir, 'custom-bot-dp.jpg');
  if (fs.existsSync(customDpPath) && variant !== 'hd') {
    return fs.readFileSync(customDpPath);
  }

  if (variant === 'thumb' && fs.existsSync(DP_THUMB_PATH)) {
    return fs.readFileSync(DP_THUMB_PATH);
  }
  if (variant === 'hd' && fs.existsSync(DP_PNG_PATH)) {
    return fs.readFileSync(DP_PNG_PATH);
  }
  if (fs.existsSync(DP_JPG_PATH)) {
    return fs.readFileSync(DP_JPG_PATH);
  }
  if (fs.existsSync(DP_PNG_PATH)) {
    return fs.readFileSync(DP_PNG_PATH);
  }
  return null;
}

/**
 * Persist a new custom Bot DP into dataDir (survives restarts on persistent hosts).
 */
export async function saveCustomBotDp(imageBuffer) {
  const sharp = await getSharp();
  const customDpPath = path.join(config.dataDir, 'custom-bot-dp.jpg');
  if (sharp) {
    const resized = await sharp(imageBuffer)
      .resize(640, 640, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer();
    fs.writeFileSync(customDpPath, resized);
    return resized;
  }
  fs.writeFileSync(customDpPath, imageBuffer);
  return imageBuffer;
}

export function resetCustomBotDp() {
  const customDpPath = path.join(config.dataDir, 'custom-bot-dp.jpg');
  if (fs.existsSync(customDpPath)) {
    fs.unlinkSync(customDpPath);
  }
  cachedRemoteDp = null;
}

/**
 * Prepare a 640x640 WhatsApp-compliant JPEG buffer (cropped cover OR full uncropped square)
 * and push it to WhatsApp via IQ stanza so it works across 100% of platforms.
 */
export async function updateWhatsAppDp(sock, targetJid, inputBuffer, { full = false } = {}) {
  if (!sock || !targetJid || !inputBuffer) {
    throw new Error('Missing socket, target JID, or image buffer');
  }

  let jpeg640 = inputBuffer;
  const sharp = await getSharp();

  if (sharp) {
    jpeg640 = await sharp(inputBuffer)
      .resize(640, 640, {
        fit: full ? 'contain' : 'cover',
        background: { r: 7, g: 13, b: 18, alpha: 1 }
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } else if (hasFfmpeg()) {
    const id = crypto.randomBytes(5).toString('hex');
    const inFile = path.join(os.tmpdir(), `dp-in-${id}`);
    const outFile = path.join(os.tmpdir(), `dp-out-${id}.jpg`);
    try {
      fs.writeFileSync(inFile, inputBuffer);
      const vf = full
        ? 'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=#070d12'
        : 'scale=640:640:force_original_aspect_ratio=increase,crop=640:640';
      await execFileAsync('ffmpeg', ['-y', '-i', inFile, '-vf', vf, '-q:v', '4', outFile]);
      jpeg640 = fs.readFileSync(outFile);
    } finally {
      fs.rmSync(inFile, { force: true });
      fs.rmSync(outFile, { force: true });
    }
  }

  const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
  const normTarget = jidNormalizedUser(targetJid);
  const isSelf = normTarget === botJid;

  await sock.query({
    tag: 'iq',
    attrs: {
      to: 's.whatsapp.net',
      type: 'set',
      xmlns: 'w:profile:picture',
      ...(isSelf ? {} : { target: normTarget })
    },
    content: [
      {
        tag: 'picture',
        attrs: { type: 'image' },
        content: jpeg640
      }
    ]
  });

  return jpeg640;
}

/**
 * Generate an AI Image or Anime AI Image buffer.
 * Uses OpenAI DALL-E 3 if OPENAI_API_KEY is configured and requested, otherwise uses
 * zero-key Pollinations Flux/Anime generation so it works out-of-the-box on all hosts.
 */
export async function generateAiImageBuffer(prompt, { anime = false, square = true } = {}) {
  const cleanPrompt = anime
    ? `Masterpiece studio anime illustration, vibrant cel-shaded anime art, high detail, glowing rim lighting: ${prompt}`
    : prompt;

  if (config.openAiKey && process.env.USE_OPENAI_IMAGE === 'true') {
    const { data } = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: 'dall-e-3',
        prompt: cleanPrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json'
      },
      {
        headers: { Authorization: `Bearer ${config.openAiKey}` },
        timeout: 45000
      }
    );
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) return Buffer.from(b64, 'base64');
  }

  const seed = Math.floor(Math.random() * 1_000_000);
  const width = 1024;
  const height = square ? 1024 : 768;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 45000,
    headers: { 'User-Agent': 'TEXMEX-MD/2.0' }
  });
  return Buffer.from(data);
}
