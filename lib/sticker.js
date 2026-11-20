import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import webpmux from 'node-webpmux';
import { getSharp, hasFfmpeg } from './env.js';

const execFileAsync = promisify(execFile);

/**
 * Inject official WhatsApp Sticker EXIF metadata (Pack Name & Publisher)
 * using pure-JS node-webpmux (works on 100% of platforms without native deps).
 */
export async function addStickerExif(webpBuffer, packname = 'TEXMEX-MD', author = 'TEXMEX-MD', categories = ['🤖']) {
  const img = new webpmux.Image();
  await img.load(webpBuffer);

  const json = {
    'sticker-pack-id': `com.texmex.md.${crypto.randomBytes(6).toString('hex')}`,
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    emojis: categories
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([exifAttr, jsonBuf]);
  exif.writeUIntLE(jsonBuf.length, 14, 4);

  img.exif = exif;
  return img.save(null);
}

/**
 * Convert static image buffer into a 512x512 WhatsApp WebP sticker.
 * Uses Sharp first (ultra-fast, no external binary required), falling back to FFmpeg.
 */
export async function imageToSticker(buffer, { packname = 'TEXMEX-MD', author = 'TEXMEX-MD' } = {}) {
  const sharp = await getSharp();
  if (sharp) {
    const webp = await sharp(buffer, { animated: true })
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 82 })
      .toBuffer();
    return addStickerExif(webp, packname, author);
  }

  if (hasFfmpeg()) {
    const tmpId = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `texmex-in-${tmpId}`);
    const outFile = path.join(os.tmpdir(), `texmex-out-${tmpId}.webp`);
    try {
      fs.writeFileSync(inFile, buffer);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inFile,
        '-vf',
        'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
        '-vcodec',
        'libwebp',
        '-lossless',
        '0',
        '-qscale',
        '75',
        '-preset',
        'default',
        '-an',
        '-vsync',
        '0',
        outFile
      ]);
      const webp = fs.readFileSync(outFile);
      return addStickerExif(webp, packname, author);
    } finally {
      fs.rmSync(inFile, { force: true });
      fs.rmSync(outFile, { force: true });
    }
  }

  throw new Error('Neither Sharp nor FFmpeg is available on this host to encode images.');
}

/**
 * Convert short video/GIF buffer into an animated 512x512 WhatsApp WebP sticker via FFmpeg.
 */
export async function videoToSticker(buffer, { packname = 'TEXMEX-MD', author = 'TEXMEX-MD' } = {}) {
  if (!hasFfmpeg()) {
    throw new Error('FFmpeg is required for animated video stickers. Install ffmpeg or send a static image.');
  }

  const tmpId = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(os.tmpdir(), `texmex-vid-${tmpId}.mp4`);
  const outFile = path.join(os.tmpdir(), `texmex-vid-${tmpId}.webp`);

  try {
    fs.writeFileSync(inFile, buffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inFile,
      '-t',
      '7',
      '-vf',
      'scale=512:512:force_original_aspect_ratio=decrease,fps=15,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
      '-vcodec',
      'libwebp',
      '-lossless',
      '0',
      '-qscale',
      '55',
      '-loop',
      '0',
      '-preset',
      'default',
      '-an',
      '-vsync',
      '0',
      outFile
    ]);
    const webp = fs.readFileSync(outFile);
    return addStickerExif(webp, packname, author);
  } finally {
    fs.rmSync(inFile, { force: true });
    fs.rmSync(outFile, { force: true });
  }
}

/**
 * Convert a static WebP sticker buffer into a PNG image buffer.
 */
export async function stickerToImage(webpBuffer) {
  const sharp = await getSharp();
  if (sharp) {
    return sharp(webpBuffer).png().toBuffer();
  }

  if (hasFfmpeg()) {
    const tmpId = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `texmex-stk-${tmpId}.webp`);
    const outFile = path.join(os.tmpdir(), `texmex-stk-${tmpId}.png`);
    try {
      fs.writeFileSync(inFile, webpBuffer);
      await execFileAsync('ffmpeg', ['-y', '-i', inFile, outFile]);
      return fs.readFileSync(outFile);
    } finally {
      fs.rmSync(inFile, { force: true });
      fs.rmSync(outFile, { force: true });
    }
  }

  throw new Error('Sharp or FFmpeg is required to convert WebP stickers to PNG.');
}
