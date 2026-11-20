import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);

// Load both .env and config.env (popular on Pterodactyl/Katabump/Bot panels)
for (const envFile of ['.env', 'config.env']) {
  const fullPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

/**
 * Detect which cloud/local runtime TEXMEX-MD is currently running on.
 */
export function detectPlatform() {
  const e = process.env;
  if (e.DYNO) return { id: 'heroku', name: 'Heroku Dyno', ephemeral: true };
  if (e.RENDER || e.RENDER_SERVICE_ID) return { id: 'render', name: 'Render Cloud', ephemeral: !e.RENDER_DISK_PATH };
  if (e.KOYEB_SERVICE_NAME || e.KOYEB_PUBLIC_DOMAIN) return { id: 'koyeb', name: 'Koyeb Cloud', ephemeral: true };
  if (e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID) return { id: 'railway', name: 'Railway', ephemeral: !e.RAILWAY_VOLUME_MOUNT_PATH };
  if (e.SPACE_ID || e.SPACE_AUTHOR_NAME) return { id: 'huggingface', name: 'Hugging Face Spaces', ephemeral: true };
  if (e.FLY_APP_NAME) return { id: 'flyio', name: 'Fly.io', ephemeral: false };
  if (e.P_SERVER_UUID || e.SERVER_PORT || e.PTERODACTYL) return { id: 'panel', name: 'Pterodactyl / Bot Panel', ephemeral: false };
  if (e.REPL_ID || e.REPL_SLUG) return { id: 'replit', name: 'Replit', ephemeral: false };
  if (e.CODESPACES) return { id: 'codespaces', name: 'GitHub Codespaces', ephemeral: false };
  if (e.TERMUX_VERSION || (e.PREFIX && e.PREFIX.includes('com.termux'))) {
    return { id: 'termux', name: 'Termux (Android)', ephemeral: false };
  }
  if (fs.existsSync('/.dockerenv')) return { id: 'docker', name: 'Docker Container', ephemeral: false };
  if (e.PM2_HOME || e.pm_id !== undefined) return { id: 'vps-pm2', name: 'VPS (PM2)', ephemeral: false };
  return { id: 'node', name: `${os.type()} (${os.arch()})`, ephemeral: false };
}

/**
 * Resolve universal listening port across Heroku, Render, Koyeb, Railway,
 * Pterodactyl/Katabump (SERVER_PORT), HuggingFace Spaces (7860), and local.
 */
export function resolvePort() {
  const e = process.env;
  const candidates = [e.PORT, e.SERVER_PORT, e.APP_PORT, e.WEB_PORT];
  for (const val of candidates) {
    const parsed = Number.parseInt(val, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  if (e.SPACE_ID) return 7860; // Hugging Face Spaces default port
  return 3000;
}

/**
 * Ensure directory is writable; seamlessly fall back to os.tmpdir() on
 * read-only container filesystems (e.g., locked Docker/HuggingFace roots).
 */
export function resolveWritableDir(preferredPath, fallbackSubdir) {
  const candidates = [
    path.resolve(process.cwd(), preferredPath),
    path.join(os.tmpdir(), 'texmex-md', fallbackSubdir)
  ];

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch {
      // Try next candidate
    }
  }
  return candidates[1];
}

let cachedFfmpegPath = undefined;
export function getFfmpegPath() {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 3000 });
    cachedFfmpegPath = 'ffmpeg';
    return cachedFfmpegPath;
  } catch {
    // Fall back to bundled ffmpeg-static binary
  }
  try {
    const staticBin = require('ffmpeg-static');
    if (staticBin && fs.existsSync(staticBin)) {
      execFileSync(staticBin, ['-version'], { stdio: 'ignore', timeout: 3000 });
      cachedFfmpegPath = staticBin;
      return cachedFfmpegPath;
    }
  } catch {
    // ignore
  }
  cachedFfmpegPath = null;
  return null;
}

export function hasFfmpeg() {
  return Boolean(getFfmpegPath());
}

let cachedSharp = null;
export async function getSharp() {
  if (cachedSharp !== null) return cachedSharp || null;
  try {
    const mod = await import('sharp');
    cachedSharp = mod.default || mod;
  } catch {
    cachedSharp = false;
  }
  return cachedSharp || null;
}

export const OFFICIAL_WEB_URL = 'https://temex-md.onrender.com/';

export function resolvePublicUrl(port) {
  const e = process.env;
  if (e.PUBLIC_URL) return e.PUBLIC_URL.replace(/\/+$/, '');
  if (e.WEB_URL) return e.WEB_URL.replace(/\/+$/, '');
  if (e.RENDER_EXTERNAL_URL) return e.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  if (e.RAILWAY_PUBLIC_DOMAIN) return `https://${e.RAILWAY_PUBLIC_DOMAIN}`;
  if (e.KOYEB_PUBLIC_DOMAIN) return `https://${e.KOYEB_PUBLIC_DOMAIN}`;
  if (e.FLY_APP_NAME) return `https://${e.FLY_APP_NAME}.fly.dev`;
  if (e.SPACE_HOST) return `https://${e.SPACE_HOST}`;
  if (e.HEROKU_APP_NAME) return `https://${e.HEROKU_APP_NAME}.herokuapp.com`;
  return OFFICIAL_WEB_URL.replace(/\/+$/, '');
}

export function resolveSandboxUrl(port) {
  const e = process.env;
  if (e.CODESPACE_NAME) return `https://${e.CODESPACE_NAME}-${port}.app.github.dev`;
  if (e.E2B_SANDBOX_ID) return `https://${port}-${e.E2B_SANDBOX_ID}.e2b.app`;
  return '';
}

export function buildPortLinksFromUrl(
  websiteUrl,
  port,
  repoWebUrl = 'https://github.com/texmexlite-67/TEMEX-MD',
  sandboxUrl = '',
  tunnelUrl = ''
) {
  const cleanWeb = String(websiteUrl || OFFICIAL_WEB_URL).replace(/\/+$/, '');
  const displayWebUrl = `${cleanWeb}/`;
  const localBind = `http://0.0.0.0:${port}`;
  const healthUrl = `${cleanWeb}/health`;
  const statusApiUrl = `${cleanWeb}/api/status`;
  const pluginsApiUrl = `${cleanWeb}/api/plugins`;
  const shortRepo = repoWebUrl.replace(/^https?:\/\//i, '');

  const extendedName = '⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 ⚡';

  const fullExtendedBio =
    `⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ━ ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦 ⚡\n` +
    `👑 𝗖𝗿𝗲𝗮𝘁𝗼𝗿 & 𝗟𝗲𝗮𝗱 𝗔𝗿𝗰𝗵𝗶𝘁𝗲𝗰𝘁 · 𝟮𝟰/𝟳 𝗠𝘂𝗹𝘁𝗶-𝗗𝗲𝘃𝗶𝗰𝗲 𝗔𝗜\n` +
    `🧠 𝗔𝗜 · 📖 𝗕𝗶𝗯𝗹𝗲 & 𝗣𝗿𝗮𝘆𝗲𝗿𝘀 · 🎙️ 𝗩𝗼𝗶𝗰𝗲 · 📥 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱𝗲𝗿 · 🛡️ 𝗚𝗿𝗼𝘂𝗽 𝗖𝗼𝗻𝘁𝗿𝗼𝗹\n` +
    `🌐 𝗪𝗲𝗯𝘀𝗶𝘁𝗲 (𝟯𝗗): ${displayWebUrl}\n` +
    `🔌 𝗣𝗼𝗿𝘁 ${port} 𝗛𝗲𝗮𝗹𝘁𝗵: ${healthUrl}\n` +
    `📊 𝗣𝗼𝗿𝘁 ${port} 𝗔𝗣𝗜: ${statusApiUrl}\n` +
    `🐙 𝗚𝗶𝘁𝗛𝘂𝗯: ${repoWebUrl}\n` +
    `❤️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗱 𝗯𝘆 𝗧𝗘𝗫𝗠𝗘𝗫 𝘄𝗶𝘁𝗵 ❤️`;

  const mediumExtendedBio =
    `⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦\n` +
    `🧠 𝗔𝗜 · 📖 𝗕𝗶𝗯𝗹𝗲/𝗣𝗿𝗮𝘆𝗲𝗿 · 🎙️ 𝗩𝗼𝗶𝗰𝗲 · 📥 𝗠𝗲𝗱𝗶𝗮 · 🛡️ 𝟮𝟰/𝟳 𝗕𝗼𝘁\n` +
    `🌐 𝗪𝗲𝗯 (𝗣𝗼𝗿𝘁 ${port}): ${displayWebUrl}\n` +
    `💓 𝗛𝗲𝗮𝗹𝘁𝗵 𝗣𝗼𝗿𝘁: ${healthUrl}\n` +
    `🐙 𝗚𝗶𝘁𝗛𝘂𝗯: ${repoWebUrl}\n` +
    `❤️ 𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗱 𝗯𝘆 𝗧𝗘𝗫𝗠𝗘𝗫`;

  const sweetSpotExtendedBio =
    `⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦 ⚡ ` +
    `👑 𝗖𝗿𝗲𝗮𝘁𝗼𝗿 · 𝟮𝟰/𝟳 𝗔𝗜 · 📖 𝗕𝗶𝗯𝗹𝗲 & 𝗣𝗿𝗮𝘆𝗲𝗿 · 🎙️ 𝗩𝗼𝗶𝗰𝗲 ` +
    `🌐 𝗪𝗲𝗯: ${displayWebUrl} ` +
    `🔌 𝗣𝗼𝗿𝘁 ${port}: ${healthUrl} ` +
    `🐙 ${shortRepo} ❤️`;

  const denseExtendedBio =
    `⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 (𝗔𝗜·𝗕𝗶𝗯𝗹𝗲·𝗩𝗼𝗶𝗰𝗲·𝟯𝗗)\n` +
    `🌐 𝗪𝗲𝗯: ${displayWebUrl}\n` +
    `🔌 𝗣𝗼𝗿𝘁 ${port}: ${healthUrl}\n` +
    `🐙 ${shortRepo} ❤️`;

  const compactBoldBio =
    `⚡𝗧𝗘𝗫𝗠𝗘𝗫⟁𝗔𝗜·𝗕𝗶𝗯𝗹𝗲·𝟯𝗗 🌐 ${displayWebUrl} | 🔌𝗣𝗼𝗿𝘁:${port} | 🐙 ${shortRepo}`;

  return {
    port,
    websiteUrl: displayWebUrl,
    cleanWebsiteUrl: cleanWeb,
    sandboxUrl: sandboxUrl || resolveSandboxUrl(port) || displayWebUrl,
    tunnelUrl: tunnelUrl || '',
    localBind,
    healthUrl,
    statusApiUrl,
    pluginsApiUrl,
    repoWebUrl,
    extendedName,
    defaultBio: sweetSpotExtendedBio,
    bioTiers: [
      fullExtendedBio,
      mediumExtendedBio,
      sweetSpotExtendedBio,
      denseExtendedBio,
      compactBoldBio
    ]
  };
}

export function resolvePortLinks(port, repoWebUrl = 'https://github.com/texmexlite-67/TEMEX-MD') {
  const initialUrl = resolvePublicUrl(port);
  const sandboxUrl = resolveSandboxUrl(port);
  return buildPortLinksFromUrl(initialUrl, port, repoWebUrl, sandboxUrl);
}

export function parseBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const normalized = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'n'].includes(normalized)) return false;
  return defaultVal;
}

export function cleanPhoneNumber(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^0-9]/g, '');
}
