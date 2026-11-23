import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import axios from 'axios';
import yts from 'yt-search';
import { downloadYouTube } from '@hiudyy/ytdl';
import ruhend from 'ruhend-scraper';
import * as sdl from 'social-dl';
import { sciFiCard, sciFiHeader, DEV_SIGNATURE } from '../lib/style.js';

// Configure social-dl's SaveTube AES-128-CBC key so its internal SaveTube worker works out of the box
if (!process.env.SOCIAL_DL_SAVETUBE_SECRET) {
  process.env.SOCIAL_DL_SAVETUBE_SECRET = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
}

const YT_URL_REGEX =
  /(?:(?:music\.|www\.|m\.)?youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/i;

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36';

/**
 * Ensure a Python-FREE standalone compiled yt-dlp binary exists on Linux x64/arm64
 * when python3 is absent (e.g. Render Native Node buildpack or slim Docker images).
 * Eliminates "/usr/bin/env: 'python3': No such file or directory" permanently!
 */
let standaloneYtDlpPromise = null;
async function ensureStandaloneYtDlp() {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }
  try {
    execSync('python3 --version', { stdio: 'ignore', timeout: 2500 });
    return null; // python3 exists, standard yt-dlp works too
  } catch {
    // python3 missing -> bootstrap standalone PyInstaller ELF binary (no Python needed!)
  }

  if (os.platform() !== 'linux') return null;
  const asset =
    os.arch() === 'x64'
      ? 'yt-dlp_linux'
      : os.arch() === 'arm64'
        ? 'yt-dlp_linux_aarch64'
        : null;
  if (!asset) return null;

  const cacheBinDir = path.resolve(process.cwd(), '.cache', 'bin');
  const binPath = path.join(cacheBinDir, asset);
  if (fs.existsSync(binPath) && fs.statSync(binPath).size > 5_000_000) {
    fs.chmodSync(binPath, 0o755);
    process.env.YT_DLP_PATH = binPath;
    return binPath;
  }

  if (!standaloneYtDlpPromise) {
    standaloneYtDlpPromise = (async () => {
      fs.mkdirSync(cacheBinDir, { recursive: true });
      const dlUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
      const resp = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 45000 });
      fs.writeFileSync(binPath, Buffer.from(resp.data), { mode: 0o755 });
      fs.chmodSync(binPath, 0o755);
      process.env.YT_DLP_PATH = binPath;
      return binPath;
    })().catch(() => null);
  }
  return standaloneYtDlpPromise;
}

/**
 * Download a media URL into a verified Buffer (> minBytes, non-HTML) with browser headers.
 */
async function downloadVerifiedBuffer(mediaUrl, extraHeaders = {}, minBytes = 20000) {
  const resp = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    maxContentLength: 95 * 1024 * 1024,
    maxBodyLength: 95 * 1024 * 1024,
    timeout: 45000,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: '*/*',
      ...extraHeaders
    }
  });
  const ctype = String(resp.headers?.['content-type'] || '').toLowerCase();
  if (ctype.includes('text/html')) {
    throw new Error('Provider returned HTML instead of media stream');
  }
  const buf = Buffer.from(resp.data);
  if (buf.length < minBytes) {
    throw new Error(`Media payload too small (${buf.length} bytes)`);
  }
  return buf;
}

/**
 * Cloud-IP-Proof YouTube Target Resolver:
 * - Direct URLs use fast yts({ videoId }) with automatic fallback to YouTube oEmbed + mattw API v3
 *   (so YouTube datacenter IP blocks on Render/Heroku NEVER break URL lookups!)
 * - Search queries use yts(query) with automatic fallback to mattw YouTube Data API v3 search!
 */
async function resolveYouTubeTarget(queryOrUrl) {
  const input = String(queryOrUrl || '').trim();
  if (!input) return null;

  const idMatch = input.match(YT_URL_REGEX);
  if (idMatch) {
    const videoId = idMatch[1];
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Fast path: yt-search with 4.5s guard
    const info = await Promise.race([
      yts({ videoId }).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 4500))
    ]);
    if (info?.title) {
      return {
        videoId,
        url: cleanUrl,
        title: info.title,
        duration: info.timestamp || 'N/A',
        seconds: Number(info.seconds || 0),
        views: info.views ? Number(info.views).toLocaleString() : 'N/A',
        author: info.author?.name || 'YouTube',
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    }

    // Cloud-IP-proof fallback: Official YouTube oEmbed endpoint (never blocked on cloud IPs!)
    try {
      const { data: oe } = await axios.get('https://www.youtube.com/oembed', {
        params: { url: cleanUrl, format: 'json' },
        timeout: 6000
      });
      return {
        videoId,
        url: cleanUrl,
        title: oe?.title || 'YouTube Track',
        duration: 'Auto',
        seconds: 0,
        views: 'N/A',
        author: oe?.author_name || 'YouTube',
        thumbnail: oe?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    } catch {
      return {
        videoId,
        url: cleanUrl,
        title: 'YouTube Media',
        duration: 'Auto',
        seconds: 0,
        views: 'N/A',
        author: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    }
  }

  // Search query path
  try {
    const search = await Promise.race([
      yts(input),
      new Promise((_, rej) => setTimeout(() => rej(new Error('yts timeout')), 7000))
    ]);
    const top = search?.videos?.[0];
    if (top?.videoId || top?.url) {
      const vid = top.videoId || top.url.match(YT_URL_REGEX)?.[1] || '';
      return {
        videoId: vid,
        url: vid ? `https://www.youtube.com/watch?v=${vid}` : top.url,
        title: top.title,
        duration: top.timestamp || 'N/A',
        seconds: Number(top.seconds || 0),
        views: top.views ? Number(top.views).toLocaleString() : 'N/A',
        author: top.author?.name || 'YouTube',
        thumbnail: top.thumbnail
      };
    }
  } catch {
    // Fallback to cloud-safe YouTube Data API v3 proxy
  }

  try {
    const { data } = await axios.get('https://ytapi.apps.mattw.io/v3/search', {
      params: { key: 'foo1', part: 'snippet', type: 'video', maxResults: 3, q: input },
      headers: { Referer: 'https://mattw.io/youtube-metadata/', 'User-Agent': BROWSER_UA },
      timeout: 8000
    });
    const item = data?.items?.[0];
    const vid = item?.id?.videoId;
    if (vid) {
      return {
        videoId: vid,
        url: `https://www.youtube.com/watch?v=${vid}`,
        title: item.snippet?.title || input,
        duration: 'Auto',
        seconds: 0,
        views: 'N/A',
        author: item.snippet?.channelTitle || 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
      };
    }
  } catch {}

  return null;
}

/**
 * TIER 1: Direct Multi-CDN SaveTube AES-128-CBC Engine
 * (Calls SaveTube's residential CDN workers directly WITHOUT calling yts(url), so Render/AWS IP blocks never affect it!)
 */
async function extractViaDirectSaveTube(videoId, mode = 'audio', qualities = [128]) {
  const secretKey = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cdnRes = await axios.get('https://media.savetube.vip/api/random-cdn', {
        timeout: 7000,
        headers: { 'User-Agent': BROWSER_UA }
      });
      const cdn = cdnRes.data?.cdn;
      if (!cdn) continue;

      const stHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
        Origin: 'https://ytshorts.savetube.me',
        Referer: 'https://ytshorts.savetube.me/'
      };

      const infoEnc = await axios.post(
        `https://${cdn}/v2/info`,
        { url: canonicalUrl },
        { headers: stHeaders, timeout: 12000 }
      );
      if (!infoEnc.data?.data) continue;

      const raw = Buffer.from(infoEnc.data.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-128-cbc', secretKey, raw.subarray(0, 16));
      const info = JSON.parse(
        Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8')
      );
      if (!info?.key) continue;

      for (const q of qualities) {
        try {
          const dlRes = await axios.post(
            `https://${cdn}/download`,
            { downloadType: mode, quality: String(q), key: info.key },
            { headers: stHeaders, timeout: 15000 }
          );
          const dlUrl = dlRes.data?.data?.downloadUrl;
          if (!dlUrl) continue;

          const buffer = await downloadVerifiedBuffer(dlUrl, {
            Referer: 'https://ytshorts.savetube.me/'
          });
          return {
            type: 'buffer',
            buffer,
            title: info.title,
            quality: mode === 'audio' ? `${q}kbps` : `${q}p`
          };
        } catch {
          // try next quality
        }
      }
    } catch {
      // try next random SaveTube CDN node
    }
  }
  return null;
}

/**
 * TIER 2: CNVmp3 / CNVmp4 Cloud Engine (check_database.php + download_video_ucep.php)
 */
async function extractViaCnvMp3(videoId, mode = 'audio') {
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const formatValue = mode === 'audio' ? 1 : 0;
  const quality = mode === 'audio' ? 4 : 360; // 4 = 128kbps MP3, 360 = 360p MP4
  const cnvHeaders = {
    'Content-Type': 'application/json',
    Origin: 'https://cnvmp3.com',
    Referer: 'https://cnvmp3.com/v55',
    'User-Agent': BROWSER_UA
  };

  try {
    const dbRes = await axios.post(
      'https://cnvmp3.com/check_database.php',
      { youtube_id: videoId, quality, formatValue },
      { headers: cnvHeaders, timeout: 9000 }
    );
    const cachedUrl = dbRes.data?.data?.server_path;
    if (!dbRes.data?.error && cachedUrl) {
      const safeUrl = cachedUrl.replace(/&/g, '%26').replace(/#/g, '%23').replace(/\+/g, '%2B');
      const buffer = await downloadVerifiedBuffer(safeUrl, { Referer: 'https://cnvmp3.com/' });
      return { type: 'buffer', buffer, quality: mode === 'audio' ? '128kbps' : '360p' };
    }

    const metaRes = await axios.post(
      'https://cnvmp3.com/get_video_data.php',
      { url: canonicalUrl, token: '1234' },
      { headers: cnvHeaders, timeout: 10000 }
    );
    if (!metaRes.data?.error && metaRes.data?.title) {
      const convRes = await axios.post(
        'https://cnvmp3.com/download_video_ucep.php',
        {
          url: canonicalUrl,
          quality,
          title: metaRes.data.title,
          formatValue,
          token: '1234'
        },
        { headers: cnvHeaders, timeout: 22000 }
      );
      const dlLink = convRes.data?.download_link;
      if (dlLink) {
        const safeUrl = dlLink.replace(/&/g, '%26').replace(/#/g, '%23').replace(/\+/g, '%2B');
        const buffer = await downloadVerifiedBuffer(safeUrl, { Referer: 'https://cnvmp3.com/' });
        return { type: 'buffer', buffer, quality: mode === 'audio' ? '128kbps' : '360p' };
      }
    }
  } catch {
    // fall through to Tier 3
  }
  return null;
}

/**
 * TIER 3: @hiudyy/ytdl 7-Provider Pool (nayan, ytconvert, nevercap, oceansaver, savetube, luka)
 */
async function extractViaHiudyyPool(videoId, fmt = 'mp3') {
  try {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await downloadYouTube(canonicalUrl, fmt);
    const mediaUrl = res?.filePath || res?.url;
    if (res?.success && mediaUrl) {
      const buffer = await downloadVerifiedBuffer(mediaUrl);
      return { type: 'buffer', buffer, quality: fmt === 'mp3' ? '128kbps' : `${res.quality || 360}p` };
    }
  } catch {
    // fall through to Tier 4
  }
  return null;
}

async function fetchYouTubeMp4(videoUrl) {
  const videoId = videoUrl.match(YT_URL_REGEX)?.[1];
  if (!videoId) throw new Error('Invalid YouTube video URL.');

  // Tier 1: Direct SaveTube Multi-CDN (360p / 480p / 720p)
  const t1 = await extractViaDirectSaveTube(videoId, 'video', [360, 480, 720]);
  if (t1) return t1;

  // Tier 2: CNVmp4 Cloud Converter
  const t2 = await extractViaCnvMp3(videoId, 'video');
  if (t2) return t2;

  // Tier 3: @hiudyy/ytdl 7-Provider Pool
  const t3 = await extractViaHiudyyPool(videoId, 'mp4');
  if (t3) return t3;

  // Tier 4: social-dl with standalone Python-free yt-dlp_linux binary
  await ensureStandaloneYtDlp();
  const tmpFile = path.join(os.tmpdir(), `texmex-yt-${crypto.randomBytes(5).toString('hex')}.mp4`);
  try {
    await sdl.youtubeSave(videoUrl, tmpFile, '360');
    if (fs.existsSync(tmpFile)) {
      const buf = fs.readFileSync(tmpFile);
      if (buf.length > 20000) {
        return { type: 'buffer', buffer: buf, quality: '360p' };
      }
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  throw new Error('All 4 YouTube MP4 extraction engines were rate-limited on this video. Please retry in a few seconds.');
}

async function fetchYouTubeMp3(videoUrl) {
  const videoId = videoUrl.match(YT_URL_REGEX)?.[1];
  if (!videoId) throw new Error('Invalid YouTube video URL.');

  // Tier 1: Direct SaveTube Multi-CDN (128kbps / 92kbps)
  const t1 = await extractViaDirectSaveTube(videoId, 'audio', [128, 92]);
  if (t1) return t1;

  // Tier 2: CNVmp3 Cloud Converter
  const t2 = await extractViaCnvMp3(videoId, 'audio');
  if (t2) return t2;

  // Tier 3: @hiudyy/ytdl 7-Provider Pool
  const t3 = await extractViaHiudyyPool(videoId, 'mp3');
  if (t3) return t3;

  // Tier 4: social-dl with standalone Python-free yt-dlp_linux binary
  await ensureStandaloneYtDlp();
  const tmpFile = path.join(os.tmpdir(), `texmex-yta-${crypto.randomBytes(5).toString('hex')}.mp3`);
  try {
    await sdl.youtubeMp3Save(videoUrl, tmpFile);
    if (fs.existsSync(tmpFile)) {
      const buf = fs.readFileSync(tmpFile);
      if (buf.length > 20000) return { type: 'buffer', buffer: buf };
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }

  throw new Error('All 4 YouTube MP3 extraction engines were rate-limited on this song. Please retry in a few seconds.');
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

      await sock.sendMessage(
        m.chat,
        {
          video: media.type === 'buffer' ? media.buffer : { url: media.url },
          mimetype: 'video/mp4',
          fileName: `${meta.title}.mp4`,
          caption
        },
        { quoted: m.raw }
      );
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
