import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import axios from 'axios';
import config from '../config.js';
import { buildPortLinksFromUrl, parseBool } from './env.js';
import { getSettings } from './store.js';
import { logger } from './logger.js';

let tunnelProcess = null;
let currentTunnelUrl = '';
let isShuttingDown = false;
let respawnTimer = null;

function hasDedicatedCloudDomain() {
  const e = process.env;
  return Boolean(
    e.PUBLIC_URL ||
      e.WEB_URL ||
      e.RENDER_EXTERNAL_URL ||
      e.RAILWAY_PUBLIC_DOMAIN ||
      e.KOYEB_PUBLIC_DOMAIN ||
      e.FLY_APP_NAME ||
      e.SPACE_HOST ||
      e.HEROKU_APP_NAME
  );
}

async function ensureCloudflaredBinary() {
  // 1. Check system PATH first
  try {
    execSync('cloudflared --version', { stdio: 'ignore', timeout: 3000 });
    return 'cloudflared';
  } catch {
    // check cached binary
  }

  const cacheBinDir = path.resolve(process.cwd(), '.cache', 'bin');
  const binPath = path.join(cacheBinDir, 'cloudflared');
  if (fs.existsSync(binPath)) {
    try {
      fs.chmodSync(binPath, 0o755);
      return binPath;
    } catch {
      // continue
    }
  }

  // Only auto-download official cloudflared binary on Linux x64 / arm64
  if (os.platform() !== 'linux') return null;
  const arch = os.arch();
  const asset =
    arch === 'x64'
      ? 'cloudflared-linux-amd64'
      : arch === 'arm64'
        ? 'cloudflared-linux-arm64'
        : null;
  if (!asset) return null;

  fs.mkdirSync(cacheBinDir, { recursive: true });
  const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  logger.info('TUNNEL', 'Downloading official Cloudflare HTTPS tunnel binary...');

  const resp = await axios.get(downloadUrl, {
    responseType: 'stream',
    timeout: 45000
  });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(binPath, { mode: 0o755 });
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  fs.chmodSync(binPath, 0o755);
  return binPath;
}

export function getPublicTunnelUrl() {
  return currentTunnelUrl;
}

/**
 * Start a free, zero-token Official Cloudflare HTTPS Quick Tunnel (or token tunnel)
 * so the 3D Web App on port 3000 opens on EVERY phone & external device worldwide.
 */
export async function startPublicTunnel(botEngine, { force = false } = {}) {
  const enabledByEnv = parseBool(process.env.ENABLE_PUBLIC_TUNNEL, true);
  if (!force && (!enabledByEnv || hasDedicatedCloudDomain())) {
    return null;
  }
  if (config.disableWhatsApp && !force) {
    return null;
  }

  stopPublicTunnel();
  isShuttingDown = false;

  const bin = await ensureCloudflaredBinary().catch((err) => {
    logger.warn('TUNNEL', `Cloudflare binary unavailable: ${err.message}`);
    return null;
  });
  if (!bin) return null;

  const cfToken = (process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
  const args = cfToken
    ? ['tunnel', '--no-autoupdate', 'run', '--token', cfToken]
    : [
        'tunnel',
        '--url',
        `http://127.0.0.1:${config.port}`,
        '--no-autoupdate',
        '--protocol',
        'http2'
      ];

  return new Promise((resolve) => {
    let resolved = false;
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    tunnelProcess = proc;

    const handleLog = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !currentTunnelUrl) {
        currentTunnelUrl = match[0];
        const sandboxUrl = config.links?.sandboxUrl || '';
        // Preserve official permanent domain (e.g. https://temex-md.onrender.com/) in Bio & primary links,
        // only falling back to tunnel URL as primary if no official domain is configured.
        const hasPermanentUrl =
          config.publicUrl &&
          !config.publicUrl.includes('localhost') &&
          !config.publicUrl.includes('.e2b.app') &&
          !config.publicUrl.includes('.trycloudflare.com');

        const primaryUrl = hasPermanentUrl ? config.publicUrl : currentTunnelUrl;
        config.publicUrl = primaryUrl;
        config.links = buildPortLinksFromUrl(
          primaryUrl,
          config.port,
          config.repoWebUrl,
          sandboxUrl,
          currentTunnelUrl
        );

        logger.success(
          'TUNNEL',
          `Global Public HTTPS Tunnel ready: ${currentTunnelUrl} (Primary Bio Web: ${config.links.websiteUrl})`
        );

        // Only re-sync Bio from tunnel if tunnel IS the primary URL
        if (!hasPermanentUrl) {
          const syncBioWhenReady = async (attempt = 0) => {
            if (isShuttingDown) return;
            if (botEngine?.state?.status === 'connected' && getSettings().autoSetBio !== false) {
              try {
                const applied = await botEngine.applyBotBio(getSettings().customBio || '');
                logger.success(
                  'BIO',
                  `Synced Global Cloudflare Web URL to WhatsApp Bio (${applied.length} chars)`
                );
              } catch (err) {
                logger.warn('BIO', `Tunnel bio sync note: ${err.message}`);
              }
            } else if (attempt < 15) {
              setTimeout(() => syncBioWhenReady(attempt + 1), 2500).unref?.();
            }
          };
          syncBioWhenReady();
        }

        if (!resolved) {
          resolved = true;
          resolve(currentTunnelUrl);
        }
      }
    };

    proc.stdout.on('data', handleLog);
    proc.stderr.on('data', handleLog);

    proc.on('exit', (code) => {
      const wasActiveProc = tunnelProcess === proc;
      if (wasActiveProc) {
        tunnelProcess = null;
        currentTunnelUrl = '';
      }
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
      // Auto-heal if tunnel ever drops unexpectedly while server is alive
      if (wasActiveProc && !isShuttingDown) {
        logger.warn('TUNNEL', `Cloudflare tunnel exited (code ${code ?? 'null'}); reconnecting in 5s...`);
        clearTimeout(respawnTimer);
        respawnTimer = setTimeout(() => {
          if (!isShuttingDown) {
            startPublicTunnel(botEngine, { force }).catch(() => {});
          }
        }, 5000);
        respawnTimer.unref?.();
      }
    });

    // Don't block boot if edge takes >12s; listener continues in background
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(currentTunnelUrl || null);
      }
    }, 12000).unref?.();
  });
}

export function stopPublicTunnel() {
  isShuttingDown = true;
  clearTimeout(respawnTimer);
  respawnTimer = null;
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    tunnelProcess = null;
    currentTunnelUrl = '';
  }
}
