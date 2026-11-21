import axios from 'axios';
import { askTexmexAi, clearUserAiMemory } from '../lib/ai.js';
import { generateAiImageBuffer } from '../lib/avatar.js';
import { updateSettings } from '../lib/store.js';
import { sciFiCard } from '../lib/style.js';

const FANCY_MAPS = [
  { name: 'Bold Serif', upper: 0x1d400, lower: 0x1d41a },
  { name: 'Italic', upper: 0x1d434, lower: 0x1d44e },
  { name: 'Bold Script', upper: 0x1d4d0, lower: 0x1d4ea },
  { name: 'Fraktur', upper: 0x1d56c, lower: 0x1d586 },
  { name: 'Double-Struck', upper: 0x1d538, lower: 0x1d552 },
  { name: 'Sans Bold', upper: 0x1d5d4, lower: 0x1d5ee },
  { name: 'Monospace', upper: 0x1d670, lower: 0x1d68a }
];

function stylizeText(str, upperBase, lowerBase) {
  let out = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += String.fromCodePoint(upperBase + (code - 65));
    } else if (code >= 97 && code <= 122) {
      out += String.fromCodePoint(lowerBase + (code - 97));
    } else {
      out += ch;
    }
  }
  return out;
}

const TRUTHS = [
  'What is the most embarrassing message you ever sent to the wrong WhatsApp group?',
  'What is one goal you are secretly working on right now?',
  'Who in this chat would survive longest on a deserted island?',
  'What is a habit you pretend not to have?',
  'What was your funniest tech mistake?'
];

const DARES = [
  'Send a voice note singing the chorus of your favorite song!',
  'Change your WhatsApp About status to "Powered by TEXMEX-MD 🤖" for 1 hour.',
  'Send the 5th photo in your camera roll (if safe!) without context.',
  'Compliment three different people in this chat right now.',
  'Type your next message using only emojis and let everyone guess what it means.'
];

const EIGHT_BALL = [
  '🟢 It is certain!',
  '🟢 Without a doubt.',
  '🟢 Yes — definitely!',
  '🟢 Outlook looks great.',
  '🟡 Ask again in a moment.',
  '🟡 Hard to tell right now.',
  '🔴 Don’t count on it.',
  '🔴 My sources say no.',
  '🔴 Very doubtful.'
];

export default [
  {
    name: 'ai',
    aliases: ['gpt', 'texmex', 'ask', 'chat'],
    category: 'ai',
    desc: 'Chat with TEXMEX-MD Conversational AI (remembers context across follow-ups)',
    usage: '.ai <question or prompt>',
    react: '🤖',
    async execute({ m, text, config }) {
      const prompt = text || m.quoted?.text;
      if (!prompt) {
        return m.reply(`⚙️ Ask anything: *.ai Explain quantum entanglement simply*`);
      }
      const answer = await askTexmexAi(prompt, {
        userKey: m.sender,
        useMemory: true
      });
      await m.reply(
        sciFiCard(`${config.botName} // AI`, [
          answer || '⚠️ No response received from AI provider.'
        ])
      );
    }
  },
  {
    name: 'aiclear',
    aliases: ['resetai', 'newchat'],
    category: 'ai',
    desc: 'Clear your rolling AI conversation memory',
    usage: '.aiclear',
    react: '🧹',
    async execute({ m }) {
      clearUserAiMemory(m.sender);
      await m.reply('🧹 Your TEXMEX-MD AI conversation memory has been cleared.');
    }
  },
  {
    name: 'chatbot',
    aliases: ['autoai', 'aichatbot'],
    category: 'ai',
    desc: 'Toggle automatic conversational AI replies without prefix (off, dm, group, or all)',
    usage: '.chatbot <off | on | dm | group | all>',
    ownerOnly: true,
    react: '🧠',
    async execute({ m, args, settings }) {
      let opt = (args[0] || '').toLowerCase();
      if (opt === 'on') opt = 'dm';
      if (!['off', 'dm', 'group', 'all'].includes(opt)) {
        return m.reply(
          sciFiCard('AUTO AI CHATBOT', [
            `📡 *Current:* ${(settings.chatbotMode || 'off').toUpperCase()}`,
            `▸ *.chatbot dm* — Auto-reply with AI in Private DMs`,
            `▸ *.chatbot group* — Reply when @mentioned or quoted in Groups`,
            `▸ *.chatbot all* — Active in both DMs & Group mentions`,
            `▸ *.chatbot off* — Disable`
          ])
        );
      }
      updateSettings({ chatbotMode: opt });
      await m.reply(
        sciFiCard('CHATBOT UPDATED', [`🤖 Auto-AI Chatbot mode set to: *${opt.toUpperCase()}*`])
      );
    }
  },
  {
    name: 'summarize',
    aliases: ['sum', 'tldr'],
    category: 'ai',
    desc: 'Summarize a long replied message or article into key bullet points',
    usage: '.summarize (reply to long text)',
    react: '📝',
    async execute({ m, text }) {
      const content = text || m.quoted?.text;
      if (!content) return m.reply('⚙️ Reply to a long message with *.summarize*');
      const res = await askTexmexAi(
        `Summarize the following text into clear, concise bullet points:\n\n${content}`,
        { systemPrompt: 'You are an executive summarization assistant.' }
      );
      await m.reply(sciFiCard('AI SUMMARY', [res]));
    }
  },
  {
    name: 'explain',
    aliases: ['eli5', 'teach'],
    category: 'ai',
    desc: 'Get a crystal-clear AI explanation of any concept or topic',
    usage: '.explain <topic>',
    react: '🎓',
    async execute({ m, text }) {
      const topic = text || m.quoted?.text;
      if (!topic) return m.reply('⚙️ Usage: *.explain How blockchain consensus works*');
      const res = await askTexmexAi(
        `Explain "${topic}" clearly, step by step, using a relatable analogy.`,
        { systemPrompt: 'You are a world-class educator who makes complex topics effortless to understand.' }
      );
      await m.reply(sciFiCard('AI EXPLAINER', [res]));
    }
  },
  {
    name: 'code',
    aliases: ['coder', 'program'],
    category: 'ai',
    desc: 'Generate clean, working code snippets in any programming language',
    usage: '.code <task description>',
    react: '💻',
    async execute({ m, text }) {
      const task = text || m.quoted?.text;
      if (!task) return m.reply('⚙️ Usage: *.code Python script to merge PDF files*');
      const res = await askTexmexAi(
        `Write clean, concise, well-commented code for: ${task}`,
        { systemPrompt: 'You are a senior software architect. Return clean code and brief usage notes.' }
      );
      await m.reply(sciFiCard('AI CODE ARCHITECT', [res]));
    }
  },
  {
    name: 'fancy',
    aliases: ['style', 'font'],
    category: 'ai',
    desc: 'Transform text into stylish Unicode fonts for WhatsApp names & bios',
    usage: '.fancy TEXMEX-MD',
    async execute({ m, text }) {
      const input = text || m.quoted?.text;
      if (!input) return m.reply('⚙️ Usage: *.fancy TEXMEX-MD*');

      const lines = FANCY_MAPS.map(
        (f, i) => `${i + 1}. ${stylizeText(input, f.upper, f.lower)}`
      );
      const spaced = input.split('').join(' ');
      lines.push(`${lines.length + 1}. ${spaced.toUpperCase()}`);

      await m.reply(sciFiCard('STYLISH FONTS', lines));
    }
  },
  {
    name: 'joke',
    aliases: [],
    category: 'ai',
    desc: 'Get a random clean joke',
    usage: '.joke',
    async execute({ m }) {
      const { data } = await axios.get(
        'https://official-joke-api.appspot.com/random_joke',
        { timeout: 8000 }
      );
      await m.reply(`😂 *${data.setup}*\n\n_${data.punchline}_`);
    }
  },
  {
    name: 'fact',
    aliases: [],
    category: 'ai',
    desc: 'Learn a random interesting fact',
    usage: '.fact',
    async execute({ m }) {
      const { data } = await axios.get(
        'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
        { timeout: 8000 }
      );
      await m.reply(`🧠 *Did You Know?*\n\n${data.text}`);
    }
  },
  {
    name: 'truth',
    aliases: [],
    category: 'ai',
    desc: 'Random Truth prompt for group games',
    usage: '.truth',
    async execute({ m }) {
      const pick = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];
      await m.reply(`🎯 *TRUTH:*\n${pick}`);
    }
  },
  {
    name: 'dare',
    aliases: [],
    category: 'ai',
    desc: 'Random Dare challenge for group games',
    usage: '.dare',
    async execute({ m }) {
      const pick = DARES[Math.floor(Math.random() * DARES.length)];
      await m.reply(`🔥 *DARE:*\n${pick}`);
    }
  },
  {
    name: '8ball',
    aliases: ['eightball'],
    category: 'ai',
    desc: 'Consult the Magic 8-Ball on a yes/no question',
    usage: '.8ball Will we win today?',
    async execute({ m, text }) {
      if (!text) return m.reply('🎱 Ask a yes/no question: *.8ball Will today be awesome?*');
      const pick = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
      await m.reply(`🎱 *Question:* ${text}\n🔮 *Answer:* ${pick}`);
    }
  },
  {
    name: 'flip',
    aliases: ['coin'],
    category: 'ai',
    desc: 'Flip a fair coin (Heads or Tails)',
    usage: '.flip',
    async execute({ m }) {
      const side = Math.random() < 0.5 ? '🪙 *HEADS!*' : '🪙 *TAILS!*';
      await m.reply(side);
    }
  },
  {
    name: 'roll',
    aliases: ['dice'],
    category: 'ai',
    desc: 'Roll a 6-sided (or custom N-sided) die',
    usage: '.roll [sides]',
    async execute({ m, args }) {
      const sides = Math.min(1000, Math.max(2, Number.parseInt(args[0] || '6', 10) || 6));
      const val = Math.floor(Math.random() * sides) + 1;
      await m.reply(`🎲 Rolled a *d${sides}* and got: *${val}*!`);
    }
  },
  {
    name: 'imagine',
    aliases: ['aiimg', 'dalle', 'genimg'],
    category: 'ai',
    desc: 'Generate a high-resolution AI image from any text prompt',
    usage: '.imagine <prompt>',
    react: '🎨',
    async execute({ sock, m, text, config }) {
      const prompt = text || m.quoted?.text;
      if (!prompt) {
        return m.reply('🎨 Usage: *.imagine Futuristic cyberpunk Nairobi skyline at night*');
      }
      await m.reply('🎨 *Generating AI image, please wait...*');
      const imgBuf = await generateAiImageBuffer(prompt, { anime: false, square: true });
      await sock.sendMessage(
        m.chat,
        {
          image: imgBuf,
          caption: sciFiCard(`${config.botName} // AI IMAGE`, [`📝 *Prompt:* ${prompt}`])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'animeai',
    aliases: ['animedp', 'aiwaifu'],
    category: 'ai',
    desc: 'Generate a custom 1:1 Anime AI image / Anime DP avatar',
    usage: '.animeai [character / scene description]',
    react: '✨',
    async execute({ sock, m, text, config }) {
      const prompt =
        text ||
        m.quoted?.text ||
        'cool cyber-samurai anime character with glowing neon emerald eyes, sleek dark hoodie, rain particles';
      await m.reply('✨ *Rendering Anime AI artwork...*');
      const imgBuf = await generateAiImageBuffer(prompt, { anime: true, square: true });
      await sock.sendMessage(
        m.chat,
        {
          image: imgBuf,
          caption: sciFiCard(`${config.botName} // ANIME AI`, [`📝 *Prompt:* ${prompt}`])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'waifu',
    aliases: ['animepic', 'anime'],
    category: 'ai',
    desc: 'Fetch a random high-resolution SFW anime character illustration',
    usage: '.waifu',
    react: '🌸',
    async execute({ sock, m, config }) {
      let imgUrl = '';
      try {
        const { data } = await axios.get('https://nekos.best/api/v2/waifu', { timeout: 9000 });
        imgUrl = data?.results?.[0]?.url || '';
      } catch {
        // Fallback to pic.re SFW anime illustration API
      }
      if (!imgUrl) {
        const { data } = await axios.get('https://pic.re/image.json', { timeout: 9000 });
        if (data?.file_url) {
          imgUrl = data.file_url.startsWith('http') ? data.file_url : `https://${data.file_url}`;
        }
      }
      if (!imgUrl) return m.reply('⚠️ Could not fetch anime image right now.');
      await sock.sendMessage(
        m.chat,
        { image: { url: imgUrl }, caption: `🌸 *Anime Art · ${config.botName}*` },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'neko',
    aliases: ['catgirl'],
    category: 'ai',
    desc: 'Fetch a random SFW neko anime illustration',
    usage: '.neko',
    react: '🐱',
    async execute({ sock, m, config }) {
      let imgUrl = '';
      try {
        const { data } = await axios.get('https://nekos.best/api/v2/neko', { timeout: 9000 });
        imgUrl = data?.results?.[0]?.url || '';
      } catch {
        // Fallback to nekos.best kitsune
        const { data } = await axios.get('https://nekos.best/api/v2/kitsune', { timeout: 9000 });
        imgUrl = data?.results?.[0]?.url || '';
      }
      if (!imgUrl) return m.reply('⚠️ Could not fetch neko image right now.');
      await sock.sendMessage(
        m.chat,
        { image: { url: imgUrl }, caption: `🐱 *Neko Anime · ${config.botName}*` },
        { quoted: m.raw }
      );
    }
  }
];
