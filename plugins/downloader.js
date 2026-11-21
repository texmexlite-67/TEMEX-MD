import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import yts from 'yt-search';
import vreden from '@vreden/youtube_scraper';
import ruhend from 'ruhend-scraper';
import * as sdl from 'social-dl';
import { getFfmpegPath } from '../lib/env.js';
import { sciFiCard, sciFiHeader, DEV_SIGNATURE } from '../lib/style.js';

const execFileAsync = promisify(execFile);

const YT_URL_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/i;

async function resolveYouTubeTarget(queryOrUrl) {
  const input = String(queryOrUrl || '').trim();
  if (!input) return null;

  const idMatch = input.match(YT_URL_REGEX);
  if (idMatch) {
    const info = await yts({ videoId: idMatch[1] }).catch(() => null);
    return {
      url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
      title: info?.title || 'YouTube Video',
      duration: info?.timestamp || 'N/A',
      seconds: Number(info?.seconds || 0),
      views: info?.views ? Number(info.views).toLocaleString() : 'N/A',
      author: info?.author?.name || 'YouTube',
      thumbnail: info?.thumbnail || `https://i.ytimg.com/vi/${idMatch[1]}/hqdefault.jpg`
    };
  }

  const search = await yts(input);
  const top = search?.videos?.[0];
  if (!top) return null;

  return {
    url: top.url,
    title: top.title,
    duration: top.timestamp || 'N/A',
    seconds: Number(top.seconds || 0),
    views: top.views ? Number(top.views).toLocaleString() : 'N/A',
    author: top.author?.name || 'YouTube',
    thumbnail: top.thumbnail
  };
}

function sanitizeFileName(name) {
  const cleaned = String(name || 'video')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'video';
}

/** Resolve a scraper result (CDN URL or Buffer) into a real Buffer. */
async function resolveMediaBuffer(media) {
  if (media?.type === 'buffer' && Buffer.isBuffer(media.buffer)) return media.buffer;
  if (!media?.url) throw new Error('No download URL was returned by the scraper.');
  const { data } = await axios.get(media.url, {
    responseType: 'arraybuffer',
    timeout: 90000,
    maxContentLength: 200 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' }
  });
  const buf = Buffer.from(data);
  if (buf.length < 8192) throw new Error('Downloaded video is empty or too small.');
  return buf;
}

/**
 * Some 360p scraper links serve fragmented/WebM data that WhatsApp cannot
 * preview. Re-mux to a baseline H.264 + AAC MP4 with faststart so the video
 * renders a proper thumbnail instead of arriving "invisible".
 */
async function normalizeMp4Buffer(inputBuf) {
  const id = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(os.tmpdir(), `texmex-yt-in-${id}.bin`);
  const outFile = path.join(os.tmpdir(), `texmex-yt-out-${id}.mp4`);
  fs.writeFileSync(inFile, inputBuf);
  try {
    await execFileAsync(
      getFfmpegPath(),
      [
        '-y', '-v', 'error', '-i', inFile,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.0',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-f', 'mp4', outFile
      ],
      { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }
    );
    const normalized = fs.readFileSync(outFile);
    return normalized.length > 8192 ? normalized : inputBuf;
  } catch {
    return inputBuf;
  } finally {
    fs.rmSync(inFile, { force: true });
    fs.rmSync(outFile, { force: true });
  }
}

/** Grab a JPEG frame for WhatsApp's video preview card. */
async function makeVideoThumbnail(videoBuf) {
  const id = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(os.tmpdir(), `texmex-thumb-${id}.mp4`);
  fs.writeFileSync(inFile, videoBuf);
  try {
    const attempts = ['1', '0'];
    for (const seek of attempts) {
      try {
        const { stdout } = await execFileAsync(
          getFfmpegPath(),
          ['-y', '-v', 'error', '-ss', seek, '-i', inFile, '-frames:v', '1', '-q:v', '3', '-f', 'image2', '-'],
          { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 30000 }
        );
        if (Buffer.isBuffer(stdout) && stdout.length > 1024) return stdout;
      } catch {
        // try next seek position
      }
    }
    return null;
  } finally {
    fs.rmSync(inFile, { force: true });
  }
}

async function fetchYouTubeMp4(videoUrl) {
  // Tier 1: @vreden/youtube_scraper (fast pre-muxed video+audio CDN MP4)
  for (const quality of [360, 480, 720]) {
    try {
      const res = await vreden.ytmp4(videoUrl, quality);
      if (res?.download?.url) {
        return { type: 'url', url: res.download.url, quality: res.download.quality || `${quality}p` };
      }
    } catch {
      // try next quality / tier
    }
  }

  // Tier 2: social-dl youtubeSave into temporary file
  const tmpFile = path.join(os.tmpdir(), `texmex-yt-${crypto.randomBytes(5).toString('hex')}.mp4`);
  try {
    await sdl.youtubeSave(videoUrl, tmpFile, '360');
    if (fs.existsSync(tmpFile)) {
      const buf = fs.readFileSync(tmpFile);
      if (buf.length > 8192) {
        return { type: 'buffer', buffer: buf, quality: '360p' };
      }
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  throw new Error('Could not extract YouTube MP4 stream right now. Try another video or link.');
}

async function fetchYouTubeMp3(videoUrl) {
  try {
    const res = await vreden.ytmp3(videoUrl, 128);
    if (res?.download?.url) {
      return { type: 'url', url: res.download.url };
    }
  } catch {
    // fallback to social-dl
  }

  const tmpFile = path.join(os.tmpdir(), `texmex-yta-${crypto.randomBytes(5).toString('hex')}.mp3`);
  try {
    await sdl.youtubeMp3Save(videoUrl, tmpFile);
    if (fs.existsSync(tmpFile)) {
      const buf = fs.readFileSync(tmpFile);
      if (buf.length > 4096) return { type: 'buffer', buffer: buf };
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  throw new Error('Could not extract YouTube MP3 audio stream right now.');
}

async function extractMediaFire(mfUrl) {
  const { data: html } = await axios.get(mfUrl, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  // Match direct downloadXXXX.mediafire.com URL or scrambled data-scrambled-url
  let directUrl = '';
  const directMatch = html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/i);
  if (directMatch) {
    directUrl = directMatch[0];
  } else {
    const scrambled = html.match(/data-scrambled-url="([^"]+)"/i);
    if (scrambled?.[1]) {
      directUrl = Buffer.from(scrambled[1], 'base64').toString('utf8');
    }
  }

  if (!directUrl) {
    throw new Error('Unable to extract direct MediaFire download link. Ensure the file is public.');
  }

  const nameMatch =
    html.match(/class="dl-btn-label"[^>]*title="([^"]+)"/i) ||
    html.match(/<div class="filename">([^<]+)<\/div>/i);
  const sizeMatch =
    html.match(/Download\s*\(([^)]+)\)/i) ||
    html.match(/<li>File size:\s*<span>([^<]+)<\/span>/i);

  const rawFileName =
    nameMatch?.[1]?.trim() ||
    decodeURIComponent(directUrl.split('/').pop()?.split('?')[0] || 'mediafire-file');
  const sizeText = sizeMatch?.[1]?.trim() || 'Unknown';

  const ext = path.extname(rawFileName).toLowerCase().replace('.', '');
  const mimeMap = {
    apk: 'application/vnd.android.package-archive',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    txt: 'text/plain'
  };

  return {
    directUrl,
    fileName: rawFileName,
    sizeText,
    mimetype: mimeMap[ext] || 'application/octet-stream'
  };
}

async function searchHighResImages(query, count = 3) {
  const urls = [];

  // Tier 1: Openverse Creative Commons High-Res Search
  try {
    const { data } = await axios.get('https://api.openverse.org/v1/images/', {
      params: { q: query, page_size: 8 },
      timeout: 10000
    });
    for (const item of data?.results || []) {
      if (item?.url && /^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(item.url)) {
        urls.push({ url: item.url, title: item.title || query });
        if (urls.length >= count) return urls;
      }
    }
  } catch {
    // fallback to Wikimedia
  }

  // Tier 2: Wikimedia Commons High-Res Search
  try {
    const { data } = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch: `filetype:bitmap ${query}`,
        gsrnamespace: 6,
        gsrlimit: 6,
        prop: 'imageinfo',
        iiprop: 'url',
        format: 'json'
      },
      headers: { 'User-Agent': 'TEXMEX-MD/2.0' },
      timeout: 10000
    });
    const pages = Object.values(data?.query?.pages || {});
    for (const p of pages) {
      const u = p?.imageinfo?.[0]?.url;
      if (u && !u.endsWith('.svg') && !u.endsWith('.tif')) {
        urls.push({ url: u, title: (p.title || query).replace(/^File:/i, '') });
        if (urls.length >= count) break;
      }
    }
  } catch {
    // ignore
  }

  return urls;
}

export default [
  {
    name: 'ytmp4',
    aliases: ['ytv', 'youtube', 'ytvideo', 'ytdl'],
    category: 'download',
    desc: 'YouTube Video Downloader — download MP4 video by YouTube URL or search query',
    usage: '.ytmp4 <YouTube link or video title>',
    react: '🎬',
    async execute({ sock, m, text }) {
      const query = text || m.quoted?.text;
      if (!query) {
        return m.reply('🎬 Usage: *.ytmp4 <YouTube URL or video name>*');
      }

      const meta = await resolveYouTubeTarget(query);
      if (!meta) return m.reply(`⚠️ No YouTube video found for: *${query}*`);

      await m.reply(
        sciFiCard('YOUTUBE DOWNLOADER', [
          `🎬 *Title:* ${meta.title}`,
          `⏱️ *Duration:* ${meta.duration} · 👁️ ${meta.views}`,
          `📡 *Status:* Downloading MP4 stream...`
        ])
      );

      const media = await fetchYouTubeMp4(meta.url);
      const caption = sciFiCard('YOUTUBE MP4 READY', [
        `🎬 *${meta.title}*`,
        `👤 *Channel:* ${meta.author}`,
        `🎞️ *Quality:* ${media.quality || '360p'}`
      ]);

      let videoBuf;
      try {
        const rawBuf = await resolveMediaBuffer(media);
        videoBuf = await normalizeMp4Buffer(rawBuf);
      } catch (err) {
        return m.reply(`⚠️ Could not prepare the MP4: ${err?.message || err}`);
      }

      const fileName = `${sanitizeFileName(meta.title)}.mp4`;
      const thumbnail = await makeVideoThumbnail(videoBuf);
      const payload = {
        video: videoBuf,
        mimetype: 'video/mp4',
        fileName,
        caption
      };
      if (thumbnail) payload.jpegThumbnail = thumbnail;

      try {
        await sock.sendMessage(m.chat, payload, { quoted: m.raw });
      } catch {
        // Last resort: a proper named document is still visible and downloadable.
        await sock.sendMessage(
          m.chat,
          { document: videoBuf, mimetype: 'video/mp4', fileName, caption },
          { quoted: m.raw }
        );
      }
    }
  },
  {
    name: 'ytmp3',
    aliases: ['yta', 'song', 'play', 'ytaudio'],
    category: 'download',
    desc: 'YouTube Audio/Song Downloader — download MP3 by link or song title',
    usage: '.ytmp3 <song name or YouTube URL>',
    react: '🎧',
    async execute({ sock, m, text }) {
      const query = text || m.quoted?.text;
      if (!query) {
        return m.reply('🎧 Usage: *.ytmp3 <song title or YouTube link>*');
      }

      const meta = await resolveYouTubeTarget(query);
      if (!meta) return m.reply(`⚠️ No song found on YouTube for: *${query}*`);

      await m.reply(
        sciFiCard('YOUTUBE AUDIO', [
          `🎵 *Track:* ${meta.title}`,
          `⏱️ *Length:* ${meta.duration}`,
          `📡 *Status:* Extracting MP3 audio...`
        ])
      );

      const audio = await fetchYouTubeMp3(meta.url);
      await sock.sendMessage(
        m.chat,
        {
          audio: audio.type === 'buffer' ? audio.buffer : { url: audio.url },
          mimetype: 'audio/mpeg',
          fileName: `${meta.title}.mp3`
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'video',
    aliases: ['vid', 'videod', 'viddl', 'dlvideo'],
    category: 'download',
    desc: 'Universal Video Downloader — download video by search name OR any social URL',
    usage: '.video <search name or video link>',
    react: '📹',
    async execute({ sock, m, text }) {
      const input = (text || m.quoted?.text || '').trim();
      if (!input) {
        return m.reply('📹 Usage: *.video <video title or URL (YouTube/TikTok/IG/FB)>*');
      }

      // If non-YouTube social link, use universal multi-platform extractor
      if (/^https?:\/\//i.test(input) && !YT_URL_REGEX.test(input)) {
        await m.reply(`${sciFiHeader('VIDEO DOWNLOADER')} Fetching video stream...`);
        const tmpFile = path.join(
          os.tmpdir(),
          `texmex-univ-${crypto.randomBytes(5).toString('hex')}.mp4`
        );
        try {
          await sdl.universalSave(input, tmpFile);
          if (fs.existsSync(tmpFile)) {
            const buf = fs.readFileSync(tmpFile);
            return sock.sendMessage(
              m.chat,
              {
                video: buf,
                mimetype: 'video/mp4',
                caption: `${sciFiHeader('VIDEO DOWNLOADED')}\n_${DEV_SIGNATURE}_`
              },
              { quoted: m.raw }
            );
          }
        } finally {
          fs.rmSync(tmpFile, { force: true });
        }
      }

      // Otherwise search/download via YouTube MP4 pipeline
      const meta = await resolveYouTubeTarget(input);
      if (!meta) return m.reply(`⚠️ Could not find a video matching: *${input}*`);

      await m.reply(`${sciFiHeader('VIDEO DOWNLOADER')} Downloading *${meta.title}*...`);
      const media = await fetchYouTubeMp4(meta.url);

      await sock.sendMessage(
        m.chat,
        {
          video: media.type === 'buffer' ? media.buffer : { url: media.url },
          mimetype: 'video/mp4',
          caption: sciFiCard('VIDEO READY', [
            `📹 *${meta.title}*`,
            `⏱️ *Duration:* ${meta.duration}`
          ])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'instagram',
    aliases: ['ig', 'insta', 'igdl', 'reels'],
    category: 'download',
    desc: 'Download Instagram Reels, Videos & Photo Posts',
    usage: '.instagram <https://www.instagram.com/reel/...>',
    react: '📸',
    async execute({ sock, m, args }) {
      const url = (args[0] || m.quoted?.text || '').trim();
      if (!/instagram\.com\//i.test(url)) {
        return m.reply('📸 Usage: *.ig <Instagram Reel or Post URL>*');
      }

      await m.reply(`${sciFiHeader('INSTAGRAM DL')} Extracting Instagram media...`);

      // Tier 1 & 2: ruhend-scraper igdl / igdl2
      for (const fn of [ruhend.igdl, ruhend.igdl2]) {
        if (typeof fn !== 'function') continue;
        try {
          const res = await fn(url);
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          if (list.length > 0 && list[0]?.url) {
            const firstUrl = list[0].url;
            return sock.sendMessage(
              m.chat,
              {
                video: { url: firstUrl },
                caption: sciFiCard('INSTAGRAM MEDIA', [`📸 Downloaded successfully!`])
              },
              { quoted: m.raw }
            );
          }
        } catch {
          // try next tier
        }
      }

      // Tier 3: social-dl instagramSave
      const tmpFile = path.join(os.tmpdir(), `texmex-ig-${crypto.randomBytes(5).toString('hex')}.mp4`);
      try {
        await sdl.instagramSave(url, tmpFile);
        const buf = fs.readFileSync(tmpFile);
        await sock.sendMessage(
          m.chat,
          {
            video: buf,
            mimetype: 'video/mp4',
            caption: sciFiCard('INSTAGRAM MEDIA', [`📸 Downloaded successfully!`])
          },
          { quoted: m.raw }
        );
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    }
  },
  {
    name: 'facebook',
    aliases: ['fb', 'fbdl', 'fbvideo'],
    category: 'download',
    desc: 'Download Facebook HD/SD Public Videos & Reels',
    usage: '.facebook <https://www.facebook.com/...>',
    react: '📘',
    async execute({ sock, m, args }) {
      const url = (args[0] || m.quoted?.text || '').trim();
      if (!/(facebook\.com|fb\.watch)\//i.test(url)) {
        return m.reply('📘 Usage: *.fb <Facebook Video or Reel URL>*');
      }

      await m.reply(`${sciFiHeader('FACEBOOK DL')} Extracting Facebook video...`);

      // Tier 1 & 2: ruhend-scraper fbdl / fbdl2
      for (const fn of [ruhend.fbdl, ruhend.fbdl2]) {
        if (typeof fn !== 'function') continue;
        try {
          const res = await fn(url);
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          const best = list.find((x) => /hd|720/i.test(x?.resolution || '')) || list[0];
          if (best?.url) {
            return sock.sendMessage(
              m.chat,
              {
                video: { url: best.url },
                caption: sciFiCard('FACEBOOK VIDEO', [
                  `📘 *Quality:* ${best.resolution || 'HD/SD'}`
                ])
              },
              { quoted: m.raw }
            );
          }
        } catch {
          // try next tier
        }
      }

      // Tier 3: social-dl facebookSave
      const tmpFile = path.join(os.tmpdir(), `texmex-fb-${crypto.randomBytes(5).toString('hex')}.mp4`);
      try {
        await sdl.facebookSave(url, tmpFile);
        const buf = fs.readFileSync(tmpFile);
        await sock.sendMessage(
          m.chat,
          {
            video: buf,
            mimetype: 'video/mp4',
            caption: sciFiCard('FACEBOOK VIDEO', [`📘 Downloaded successfully!`])
          },
          { quoted: m.raw }
        );
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    }
  },
  {
    name: 'tiktok',
    aliases: ['tt', 'ttdl', 'tiktokdl'],
    category: 'download',
    desc: 'Download TikTok Videos without watermark in HD',
    usage: '.tiktok <https://www.tiktok.com/...>',
    react: '🎵',
    async execute({ sock, m, args }) {
      const url = (args[0] || m.quoted?.text || '').trim();
      if (!/tiktok\.com\//i.test(url)) {
        return m.reply('🎵 Usage: *.tiktok <TikTok Video URL>*');
      }

      await m.reply(`${sciFiHeader('TIKTOK DL')} Removing watermark & fetching HD stream...`);

      // Tier 1: TikWM Official JSON API (fast, no-watermark HD)
      try {
        const { data } = await axios.get('https://www.tikwm.com/api/', {
          params: { url, hd: 1 },
          timeout: 15000
        });
        const info = data?.data;
        const playUrl = info?.hdplay || info?.play;
        if (playUrl) {
          const fullUrl = playUrl.startsWith('http') ? playUrl : `https://www.tikwm.com${playUrl}`;
          return sock.sendMessage(
            m.chat,
            {
              video: { url: fullUrl },
              caption: sciFiCard('TIKTOK NO-WATERMARK', [
                `👤 *Author:* ${info.author?.nickname || info.author?.unique_id || 'Creator'}`,
                `📝 *Caption:* ${(info.title || 'TikTok Video').slice(0, 120)}`
              ])
            },
            { quoted: m.raw }
          );
        }
      } catch {
        // fallback
      }

      // Tier 2: ruhend-scraper ttdl
      try {
        const res = await ruhend.ttdl(url);
        if (res?.video) {
          return sock.sendMessage(
            m.chat,
            {
              video: { url: res.video },
              caption: sciFiCard('TIKTOK NO-WATERMARK', [
                `📝 *Title:* ${res.title || 'TikTok Video'}`
              ])
            },
            { quoted: m.raw }
          );
        }
      } catch {
        // fallback
      }

      // Tier 3: social-dl tiktokSave
      const tmpFile = path.join(os.tmpdir(), `texmex-tt-${crypto.randomBytes(5).toString('hex')}.mp4`);
      try {
        await sdl.tiktokSave(url, tmpFile);
        const buf = fs.readFileSync(tmpFile);
        await sock.sendMessage(
          m.chat,
          {
            video: buf,
            mimetype: 'video/mp4',
            caption: sciFiCard('TIKTOK NO-WATERMARK', [`🎵 Downloaded successfully!`])
          },
          { quoted: m.raw }
        );
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    }
  },
  {
    name: 'mediafire',
    aliases: ['mf', 'mfdl'],
    category: 'download',
    desc: 'Download files & archives directly from MediaFire links',
    usage: '.mediafire <https://www.mediafire.com/file/...>',
    react: '📦',
    async execute({ sock, m, args }) {
      const url = (args[0] || m.quoted?.text || '').trim();
      if (!/mediafire\.com\//i.test(url)) {
        return m.reply('📦 Usage: *.mediafire <https://www.mediafire.com/file/...>*');
      }

      await m.reply(`${sciFiHeader('MEDIAFIRE DL')} Resolving direct CDN package...`);
      const file = await extractMediaFire(url);

      await sock.sendMessage(
        m.chat,
        {
          document: { url: file.directUrl },
          fileName: file.fileName,
          mimetype: file.mimetype,
          caption: sciFiCard('MEDIAFIRE PACKAGE', [
            `📄 *File:* ${file.fileName}`,
            `💾 *Size:* ${file.sizeText}`
          ])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'img',
    aliases: ['image', 'imgdl', 'pic', 'gimage', 'photos'],
    category: 'download',
    desc: 'Search and download high-resolution images for any keyword',
    usage: '.img <search topic>',
    react: '🖼️',
    async execute({ sock, m, text }) {
      const query = (text || m.quoted?.text || '').trim();
      if (!query) {
        return m.reply('🖼️ Usage: *.img Nissan GTR neon*');
      }

      const results = await searchHighResImages(query, 3);
      if (!results.length) {
        return m.reply(`⚠️ No images found for: *${query}*`);
      }

      let sent = 0;
      for (const item of results) {
        try {
          await sock.sendMessage(
            m.chat,
            {
              image: { url: item.url },
              caption:
                sent === 0
                  ? sciFiCard('IMAGE DOWNLOADER', [
                      `🔎 *Query:* ${query}`,
                      `🖼️ *Title:* ${String(item.title).slice(0, 80)}`
                    ])
                  : `🖼️ *${query}* · _${DEV_SIGNATURE}_`
            },
            sent === 0 ? { quoted: m.raw } : undefined
          );
          sent += 1;
        } catch {
          // skip unreachable CDN image
        }
      }

      if (sent === 0) {
        await m.reply('⚠️ Found image links, but remote host blocked direct download. Try another keyword.');
      }
    }
  }
];
