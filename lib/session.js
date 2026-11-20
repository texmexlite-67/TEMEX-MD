import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { logger } from './logger.js';

export const SESSION_PREFIX = 'TEXMEX-MD~';

/**
 * Encode a session directory's creds.json into a portable TEXMEX-MD~ string
 * suitable for SESSION_ID on Heroku, Render, Koyeb, Railway, Docker, or Panels.
 */
export function exportSessionId(sessionDir) {
  const credsPath = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(credsPath)) {
    return null;
  }
  const raw = fs.readFileSync(credsPath);
  const compressed = zlib.gzipSync(raw, { level: 9 });
  return `${SESSION_PREFIX}${compressed.toString('base64')}`;
}

/**
 * Decode a TEXMEX-MD~ session string (supports gzip+base64, plain base64, or raw JSON)
 * and return the validated creds JSON string.
 */
export function decodeSessionString(sessionStr) {
  if (!sessionStr || typeof sessionStr !== 'string') {
    throw new Error('Empty session string');
  }

  let payload = sessionStr.trim();
  // Strip any known prefix such as TEXMEX-MD~ or TEXMEX~
  const tildeIdx = payload.indexOf('~');
  if (tildeIdx !== -1 && tildeIdx < 24) {
    payload = payload.slice(tildeIdx + 1).trim();
  }

  let jsonText = null;

  if (payload.startsWith('{') && payload.endsWith('}')) {
    jsonText = payload;
  } else {
    const buf = Buffer.from(payload, 'base64');
    // Check gzip magic header 0x1f 0x8b
    if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      jsonText = zlib.gunzipSync(buf).toString('utf8');
    } else {
      jsonText = buf.toString('utf8');
    }
  }

  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || !parsed.noiseKey || !parsed.signedIdentityKey) {
    throw new Error('Invalid WhatsApp Multi-Device credentials payload');
  }

  return JSON.stringify(parsed, null, 2);
}

/**
 * Hydrate sessionDir/creds.json from SESSION_ID environment variable if no active local creds exist
 * (or if forceOverwrite is true).
 */
export function hydrateSessionFromEnv(sessionDir, sessionId, forceOverwrite = false) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const credsPath = path.join(sessionDir, 'creds.json');

  if (!sessionId) {
    return { hydrated: false, hasExisting: fs.existsSync(credsPath) };
  }

  if (fs.existsSync(credsPath) && !forceOverwrite) {
    return { hydrated: false, hasExisting: true };
  }

  try {
    const jsonText = decodeSessionString(sessionId);
    fs.writeFileSync(credsPath, jsonText, 'utf8');
    logger.success('SESSION', 'Successfully restored WhatsApp credentials from SESSION_ID');
    return { hydrated: true, hasExisting: true };
  } catch (err) {
    logger.error('SESSION', `Failed to decode SESSION_ID: ${err.message}`);
    return { hydrated: false, hasExisting: fs.existsSync(credsPath), error: err.message };
  }
}

/**
 * Check if valid credentials currently exist on disk.
 */
export function hasSavedSession(sessionDir) {
  const credsPath = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(credsPath)) return false;
  try {
    const raw = fs.readFileSync(credsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.noiseKey && parsed?.signedIdentityKey);
  } catch {
    return false;
  }
}

/**
 * Wipe session folder safely (used on loggedOut or manual session reset).
 */
export function clearSessionDir(sessionDir) {
  if (!fs.existsSync(sessionDir)) return;
  for (const entry of fs.readdirSync(sessionDir)) {
    try {
      fs.rmSync(path.join(sessionDir, entry), { recursive: true, force: true });
    } catch {
      // ignore locked files
    }
  }
  fs.mkdirSync(sessionDir, { recursive: true });
}
