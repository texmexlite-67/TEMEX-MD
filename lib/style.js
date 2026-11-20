/**
 * TEXMEX-MD Sci-Fi Hyper-Cool Typography & HUD Formatter
 * Developed by TEXMEX with ❤️
 */

const SANS_BOLD_UPPER = 0x1d5d4; // 𝗔-𝗭
const SANS_BOLD_LOWER = 0x1d5ee; // 𝗮-𝘇
const SANS_BOLD_DIGIT = 0x1d7ec; // 𝟬-𝟵

const SMALL_CAPS_MAP = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

/**
 * Convert plain ASCII string into bold futuristic Sci-Fi Sans-Bold Unicode.
 * Example: "TEXMEX-MD" -> "𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗"
 */
export function toSciFiBold(input) {
  let out = '';
  for (const ch of String(input || '')) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += String.fromCodePoint(SANS_BOLD_UPPER + (code - 65));
    } else if (code >= 97 && code <= 122) {
      out += String.fromCodePoint(SANS_BOLD_LOWER + (code - 97));
    } else if (code >= 48 && code <= 57) {
      out += String.fromCodePoint(SANS_BOLD_DIGIT + (code - 48));
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Convert plain text into sleek Sci-Fi Small-Caps tactical HUD labels.
 * Example: "SYSTEM ONLINE" -> "ꜱʏꜱᴛᴇᴍ ᴏɴʟɪɴᴇ"
 */
export function toCyberCaps(input) {
  let out = '';
  for (const ch of String(input || '')) {
    const lower = ch.toLowerCase();
    out += SMALL_CAPS_MAP[lower] || ch;
  }
  return out;
}

/**
 * Convert text into Sci-Fi Sans-Bold while keeping URLs, ports, and handles in
 * plain ASCII so WhatsApp renders every link as a clickable hyperlink.
 */
export function toBoldPreservingUrls(input) {
  const urlRegex = /(https?:\/\/[^\s]+|(?:github\.com|wa\.me)\/[^\s]+)/gi;
  return String(input || '')
    .split(urlRegex)
    .map((part) => (/^(https?:\/\/|(?:github\.com|wa\.me)\/)/i.test(part) ? part : toSciFiBold(part)))
    .join('');
}

export const OFFICIAL_WEB_URL = 'https://temex-md.onrender.com/';
export const EXTENDED_OWNER_NAME = '⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 ⚡';
export const TAG_DESCRIPTION = `⚡ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦 · 🌐 ${OFFICIAL_WEB_URL}`;
export const DEV_SIGNATURE = `⚡ ᴅᴇᴠᴇʟᴏᴘᴇᴅ ʙʏ 𝗧𝗘𝗫𝗠𝗘𝗫 ᴡɪᴛʜ ❤️ · 🌐 ${OFFICIAL_WEB_URL}`;
export const DEV_SIGNATURE_PLAIN = `Developed by TEXMEX with ❤️ · ${OFFICIAL_WEB_URL}`;
export const SCI_FI_ENDPOINT_TITLE = '⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗖𝗬𝗕𝗘𝗥-𝗠𝗗 𝗡𝗘𝗫𝗨𝗦 ⟁';

/**
 * Render a futuristic Sci-Fi HUD card with title, body lines, and TEXMEX signature.
 */
export function sciFiCard(title, lines = [], includeFooter = true) {
  const styledTitle = toSciFiBold(String(title).toUpperCase());
  const body = lines.map((l) => `┃ ${l}`).join('\n');
  const footer = includeFooter ? `\n┗━━⟪ ${DEV_SIGNATURE} ⟫━━┛` : '\n┗━━━━━━━━━━━━━━━━━━━━━━┛';
  return `┏━━⟪ ⚡ ${styledTitle} ⟫━━┓\n${body}${footer}`;
}

/**
 * Render a single-line Sci-Fi section header.
 */
export function sciFiHeader(title) {
  return `⟦ ⚡ ${toSciFiBold(String(title).toUpperCase())} ⟧`;
}
