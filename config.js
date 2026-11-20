import {
  detectPlatform,
  resolvePort,
  resolveWritableDir,
  resolvePublicUrl,
  resolvePortLinks,
  parseBool,
  cleanPhoneNumber
} from './lib/env.js';

const platform = detectPlatform();
const port = resolvePort();
const repoUrl = process.env.REPO_URL || 'https://github.com/texmexlite-67/TEMEX-MD.git';
const repoWebUrl = repoUrl.replace(/\.git$/i, '');
const links = resolvePortLinks(port, repoWebUrl);

const persistentRoot =
  process.env.RENDER_DISK_PATH ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  process.cwd();

export const config = {
  // Core Identity
  botName: (process.env.BOT_NAME || 'TEXMEX-MD').trim(),
  ownerName: (process.env.OWNER_NAME || 'TEXMEX-MD').trim(),
  ownerNumber: cleanPhoneNumber(process.env.OWNER_NUMBER || ''),
  sudoNumbers: (process.env.SUDO_NUMBERS || '')
    .split(',')
    .map((n) => cleanPhoneNumber(n))
    .filter(Boolean),
  version: '2.0.0',

  // Sticker & Bot Avatar Metadata
  packname: (process.env.STICKER_PACKNAME || 'TEXMEX-MD').trim(),
  author: (process.env.STICKER_AUTHOR || 'TEXMEX-MD').trim(),
  botDpUrl: (process.env.BOT_DP_URL || '').trim(),
  autoSetBotDp: parseBool(process.env.AUTO_SET_BOT_DP, true),
  menuImage: parseBool(process.env.MENU_IMAGE, true),

  // Command Behaviour (Default: Public mode, '.' single prefix per setup)
  prefix: (process.env.PREFIX || '.').trim() || '.',
  multiPrefix: parseBool(process.env.MULTI_PREFIX, false),
  mode: (process.env.MODE || 'public').toLowerCase() === 'private' ? 'private' : 'public',

  // Authentication & Session
  sessionId: (process.env.SESSION_ID || '').trim(),
  pairingNumber: cleanPhoneNumber(process.env.PAIRING_NUMBER || ''),
  customPairingCode: (process.env.CUSTOM_PAIRING_CODE || 'TEXMEXMD').trim().toUpperCase(),
  useCustomPairingCode: parseBool(process.env.USE_CUSTOM_PAIRING_CODE, false),
  printQrInTerminal: parseBool(process.env.PRINT_QR, true),
  sendSessionOnConnect: parseBool(process.env.SEND_SESSION_ON_CONNECT, true),

  // Automation Defaults
  autoRead: parseBool(process.env.AUTO_READ, false),
  autoStatusView: parseBool(process.env.AUTO_STATUS_VIEW, true),
  autoStatusReact: parseBool(process.env.AUTO_STATUS_REACT, false),
  statusReactEmoji: (process.env.STATUS_REACT_EMOJI || '💚').trim(),
  autoTyping: parseBool(process.env.AUTO_TYPING, false),
  autoRecording: parseBool(process.env.AUTO_RECORDING, false),
  antiDelete: (process.env.ANTI_DELETE || 'dm').toLowerCase(), // 'off' | 'chat' | 'dm'
  antiCall: (process.env.ANTI_CALL || 'off').toLowerCase(), // 'off' | 'reject' | 'block'

  // Optional AI Provider Keys (works without keys via built-in fallback too)
  openAiKey: (process.env.OPENAI_API_KEY || '').trim(),
  geminiKey: (process.env.GEMINI_API_KEY || '').trim(),
  groqKey: (process.env.GROQ_API_KEY || '').trim(),

  // Runtime Environment & Directories
  platform,
  port,
  host: process.env.HOST || '0.0.0.0',
  publicUrl: resolvePublicUrl(port),
  keepAliveUrl: (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').trim(),
  keepAliveIntervalMs: Number.parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '600000', 10),
  dashboardKey: (process.env.DASHBOARD_KEY || process.env.ADMIN_PASS || '').trim(),
  disableWhatsApp: parseBool(process.env.DISABLE_WA_CONNECT, false),

  sessionDir: resolveWritableDir(
    process.env.SESSION_DIR || `${persistentRoot}/session`,
    'session'
  ),
  dataDir: resolveWritableDir(
    process.env.DATA_DIR || `${persistentRoot}/data`,
    'data'
  ),

  repoUrl,
  repoWebUrl,
  links,
  autoSetBio: parseBool(process.env.AUTO_SET_BIO, true),
  developerTag: 'Developed by TEXMEX with ❤️ · https://temex-md.onrender.com/',
  timeZone: process.env.TZ || 'Africa/Nairobi'
};

export default config;
