import axios from 'axios';
import QRCode from 'qrcode';

/**
 * Safe recursive-descent math expression evaluator (supports +, -, *, /, %, ^, parentheses & math functions).
 */
export function safeEvaluateMath(expr) {
  const tokens = [];
  const cleaned = String(expr).replace(/\s+/g, '');
  if (!cleaned || cleaned.length > 200) throw new Error('Invalid expression');

  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
        numStr += cleaned[i++];
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: 'num', value: val });
    } else if (/[a-zA-Z]/.test(ch)) {
      let id = '';
      while (i < cleaned.length && /[a-zA-Z0-9]/.test(cleaned[i])) {
        id += cleaned[i++];
      }
      tokens.push({ type: 'id', value: id.toLowerCase() });
    } else {
      throw new Error(`Unexpected character: "${ch}"`);
    }
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const FUNCS = {
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log10,
    ln: Math.log,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil
  };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function parseExpr() {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    while (peek()?.type === 'op' && ['*', '/', '%'].includes(peek().value)) {
      const op = consume().value;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else left %= right;
    }
    return left;
  }

  function parsePower() {
    let base = parseUnary();
    if (peek()?.type === 'op' && peek().value === '^') {
      consume();
      const exp = parsePower();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary() {
    if (peek()?.type === 'op' && peek().value === '-') {
      consume();
      return -parseUnary();
    }
    if (peek()?.type === 'op' && peek().value === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Incomplete expression');
    if (tok.type === 'num') {
      consume();
      return tok.value;
    }
    if (tok.type === 'id') {
      consume();
      if (peek()?.value === '(') {
        consume();
        const fn = FUNCS[tok.value];
        if (!fn) throw new Error(`Unknown function: ${tok.value}`);
        const arg = parseExpr();
        if (consume()?.value !== ')') throw new Error('Missing closing parenthesis');
        return fn(arg);
      }
      if (tok.value in CONSTS) return CONSTS[tok.value];
      throw new Error(`Unknown identifier: ${tok.value}`);
    }
    if (tok.value === '(') {
      consume();
      const val = parseExpr();
      if (consume()?.value !== ')') throw new Error('Missing closing parenthesis');
      return val;
    }
    throw new Error(`Unexpected token: ${tok.value}`);
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error('Unexpected trailing input');
  return result;
}

const WMO_CODES = {
  0: '☀️ Clear sky',
  1: '🌤️ Mainly clear',
  2: '⛅ Partly cloudy',
  3: '☁️ Overcast',
  45: '🌫️ Foggy',
  51: '🌦️ Light drizzle',
  61: '🌧️ Slight rain',
  63: '🌧️ Moderate rain',
  65: '⛈️ Heavy rain',
  71: '❄️ Snowfall',
  80: '🌦️ Rain showers',
  95: '⛈️ Thunderstorm'
};

export default [
  {
    name: 'tr',
    aliases: ['translate', 'tl'],
    category: 'tools',
    desc: 'Translate text or a replied message into any language code (en, sw, es, fr, ar, etc.)',
    usage: '.tr <lang> [text]',
    react: '🌐',
    async execute({ m, args }) {
      let targetLang = 'en';
      let content = '';

      if (m.quoted?.text && args.length <= 1) {
        targetLang = (args[0] || 'en').toLowerCase();
        content = m.quoted.text;
      } else if (args.length >= 2) {
        targetLang = args[0].toLowerCase();
        content = args.slice(1).join(' ');
      } else if (m.quoted?.text) {
        content = m.quoted.text;
      }

      if (!content) {
        return m.reply('⚙️ Usage: *.tr es Hello friend* or reply to a message with *.tr sw*');
      }

      const { data } = await axios.get(
        'https://translate.googleapis.com/translate_a/single',
        {
          params: {
            client: 'gtx',
            sl: 'auto',
            tl: targetLang,
            dt: 't',
            q: content
          },
          timeout: 10000
        }
      );

      const translated = Array.isArray(data?.[0])
        ? data[0].map((seg) => seg[0]).join('')
        : '';
      const detectedLang = data?.[2] || 'auto';

      await m.reply(
        `🌐 *TRANSLATION (${detectedLang.toUpperCase()} → ${targetLang.toUpperCase()})*\n\n${translated}`
      );
    }
  },
  {
    name: 'weather',
    aliases: ['forecast'],
    category: 'tools',
    desc: 'Get real-time weather conditions for any city worldwide',
    usage: '.weather <city>',
    react: '🌦️',
    async execute({ m, text }) {
      if (!text) return m.reply('⚙️ Usage: *.weather Nairobi*');

      const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: { name: text, count: 1, language: 'en', format: 'json' },
        timeout: 10000
      });
      const place = geo.data?.results?.[0];
      if (!place) return m.reply(`⚠️ Location not found: *${text}*`);

      const wx = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code'
        },
        timeout: 10000
      });

      const cur = wx.data?.current || {};
      const desc = WMO_CODES[cur.weather_code] || '🌤️ Fair';

      await m.reply(
        `🌍 *WEATHER: ${place.name}, ${place.country || ''}*\n\n` +
        `├ *Condition:* ${desc}\n` +
        `├ *Temperature:* ${cur.temperature_2m}°C (Feels like ${cur.apparent_temperature}°C)\n` +
        `├ *Humidity:* ${cur.relative_humidity_2m}%\n` +
        `└ *Wind Speed:* ${cur.wind_speed_10m} km/h`
      );
    }
  },
  {
    name: 'define',
    aliases: ['dict', 'meaning'],
    category: 'tools',
    desc: 'Look up English dictionary definitions & examples',
    usage: '.define <word>',
    async execute({ m, args }) {
      const word = (args[0] || '').trim();
      if (!word) return m.reply('⚙️ Usage: *.define resilience*');

      try {
        const { data } = await axios.get(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
          { timeout: 10000 }
        );
        const entry = data?.[0];
        const meaning = entry?.meanings?.[0];
        const def = meaning?.definitions?.[0];

        await m.reply(
          `📖 *DICTIONARY: ${entry.word}* ${entry.phonetic ? `(${entry.phonetic})` : ''}\n` +
          `├ *Part of Speech:* ${meaning?.partOfSpeech || 'n/a'}\n` +
          `├ *Definition:* ${def?.definition || 'No definition found.'}\n` +
          (def?.example ? `└ *Example:* _"${def.example}"_` : '')
        );
      } catch {
        await m.reply(`⚠️ No dictionary entry found for *"${word}"*.`);
      }
    }
  },
  {
    name: 'wiki',
    aliases: ['wikipedia'],
    category: 'tools',
    desc: 'Fetch a concise Wikipedia encyclopedia summary',
    usage: '.wiki <topic>',
    async execute({ m, text }) {
      if (!text) return m.reply('⚙️ Usage: *.wiki Quantum computing*');
      try {
        const slug = encodeURIComponent(text.trim().replace(/\s+/g, '_'));
        const { data } = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
          {
            timeout: 10000,
            headers: { 'User-Agent': 'TEXMEX-MD/2.0 (WhatsApp Multi-Device Bot)' }
          }
        );
        await m.reply(
          `📚 *${data.title}*\n\n${data.extract}\n\n🔗 ${data.content_urls?.desktop?.page || ''}`
        );
      } catch {
        await m.reply(`⚠️ Could not find a Wikipedia summary for *"${text}"*.`);
      }
    }
  },
  {
    name: 'calc',
    aliases: ['math'],
    category: 'tools',
    desc: 'Evaluate mathematical expressions safely',
    usage: '.calc sqrt(144) + 5^2',
    async execute({ m, text }) {
      if (!text) return m.reply('⚙️ Usage: *.calc (25 * 4) + sqrt(81)*');
      const ans = safeEvaluateMath(text);
      await m.reply(`🧮 *Expression:* \`${text}\`\n✅ *Result:* *${ans}*`);
    }
  },
  {
    name: 'qr',
    aliases: ['qrcode'],
    category: 'tools',
    desc: 'Generate a high-resolution QR code image from text or URL',
    usage: '.qr <text or link>',
    react: '🔳',
    async execute({ sock, m, text, config }) {
      const input = text || m.quoted?.text;
      if (!input) return m.reply('⚙️ Usage: *.qr https://example.com*');

      const pngBuffer = await QRCode.toBuffer(input, {
        width: 600,
        margin: 2
      });
      await sock.sendMessage(
        m.chat,
        { image: pngBuffer, caption: `🔳 *QR Generated by ${config.botName}*` },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'short',
    aliases: ['tinyurl', 'shorten'],
    category: 'tools',
    desc: 'Shorten a long web URL',
    usage: '.short <https://...>',
    async execute({ m, args }) {
      const url = (args[0] || m.quoted?.text || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        return m.reply('⚙️ Provide a valid URL starting with http:// or https://');
      }
      const { data } = await axios.get('https://tinyurl.com/api-create.php', {
        params: { url },
        timeout: 10000
      });
      await m.reply(`🔗 *Shortened URL:*\n${data}`);
    }
  },
  {
    name: 'github',
    aliases: ['gh', 'gituser'],
    category: 'tools',
    desc: 'Look up a GitHub developer profile',
    usage: '.github <username>',
    async execute({ sock, m, args }) {
      const username = (args[0] || '').trim();
      if (!username) return m.reply('⚙️ Usage: *.github torvalds*');

      try {
        const { data } = await axios.get(
          `https://api.github.com/users/${encodeURIComponent(username)}`,
          { timeout: 10000, headers: { 'User-Agent': 'TEXMEX-MD' } }
        );
        const caption =
          `🐙 *GITHUB PROFILE: ${data.login}*\n\n` +
          `├ *Name:* ${data.name || 'N/A'}\n` +
          `├ *Bio:* ${data.bio || 'No bio'}\n` +
          `├ *Public Repos:* ${data.public_repos}\n` +
          `├ *Followers:* ${data.followers} · *Following:* ${data.following}\n` +
          `├ *Location:* ${data.location || 'N/A'}\n` +
          `└ *URL:* ${data.html_url}`;

        if (data.avatar_url) {
          await sock.sendMessage(
            m.chat,
            { image: { url: data.avatar_url }, caption },
            { quoted: m.raw }
          );
        } else {
          await m.reply(caption);
        }
      } catch {
        await m.reply(`⚠️ GitHub user *"${username}"* not found.`);
      }
    }
  },
  {
    name: 'currency',
    aliases: ['fx', 'convert'],
    category: 'tools',
    desc: 'Convert currency amounts using live exchange rates',
    usage: '.currency 100 USD KES',
    async execute({ m, args }) {
      if (args.length < 3) {
        return m.reply('⚙️ Usage: *.currency 100 USD KES*');
      }
      const amount = Number.parseFloat(args[0]);
      const from = args[1].toUpperCase();
      const to = args[2].toUpperCase();
      if (Number.isNaN(amount) || amount <= 0) {
        return m.reply('⚙️ Please enter a valid positive number.');
      }

      const { data } = await axios.get(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, {
        timeout: 10000
      });
      const rate = data?.rates?.[to];
      if (!rate) {
        return m.reply(`⚠️ Unsupported currency code (*${from}* or *${to}*).`);
      }
      const converted = (amount * rate).toLocaleString(undefined, {
        maximumFractionDigits: 2
      });
      await m.reply(
        `💱 *CURRENCY EXCHANGE*\n` +
        `├ *${amount} ${from}* = *${converted} ${to}*\n` +
        `└ *Rate:* 1 ${from} = ${rate.toFixed(4)} ${to}`
      );
    }
  },
  {
    name: 'base64',
    aliases: ['b64'],
    category: 'tools',
    desc: 'Encode or decode Base64 text',
    usage: '.base64 <enc | dec> <text>',
    async execute({ m, args }) {
      const action = (args[0] || '').toLowerCase();
      const input = args.slice(1).join(' ') || m.quoted?.text || '';
      if (!['enc', 'dec'].includes(action) || !input) {
        return m.reply('⚙️ Usage: *.base64 enc Hello* or *.base64 dec SGVsbG8=*');
      }
      const out =
        action === 'enc'
          ? Buffer.from(input, 'utf8').toString('base64')
          : Buffer.from(input, 'base64').toString('utf8');
      await m.reply(`🔐 *Base64 (${action.toUpperCase()}):*\n${out}`);
    }
  },
  {
    name: 'time',
    aliases: ['clock'],
    category: 'tools',
    desc: 'Show current date and time in a specified IANA timezone',
    usage: '.time [Africa/Nairobi]',
    async execute({ m, args, config }) {
      const tz = args[0] || config.timeZone || 'UTC';
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          dateStyle: 'full',
          timeStyle: 'long'
        }).format(new Date());
        await m.reply(`🕒 *Time in ${tz}:*\n${formatted}`);
      } catch {
        await m.reply('⚠️ Invalid IANA timezone. Examples: *Africa/Nairobi*, *Europe/London*, *America/New_York*, *Asia/Tokyo*');
      }
    }
  },
  {
    name: 'quoted',
    aliases: ['q'],
    category: 'tools',
    desc: 'Inspect metadata of a quoted message',
    usage: '.quoted (reply to a message)',
    async execute({ m }) {
      if (!m.quoted) return m.reply('⚙️ Reply to a message with *.quoted*');
      const info = {
        id: m.quoted.id,
        sender: m.quoted.sender,
        type: m.quoted.mtype,
        isViewOnce: m.quoted.isViewOnce,
        textPreview: (m.quoted.text || '').slice(0, 120)
      };
      await m.reply(`🔍 *Quoted Message Info:*\n\`\`\`${JSON.stringify(info, null, 2)}\`\`\``);
    }
  }
];
