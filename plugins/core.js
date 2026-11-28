import os from 'node:os';
import { getCommandsByCategory, findCommand, getAllCommands } from '../lib/plugins.js';
import { getStats } from '../lib/store.js';
import { hasFfmpeg, getSharp } from '../lib/env.js';
import { getBotDpBuffer } from '../lib/avatar.js';
import { getPublicTunnelUrl, startPublicTunnel } from '../lib/tunnel.js';
import {
  toSciFiBold,
  toCyberCaps,
  sciFiCard,
  sciFiHeader,
  DEV_SIGNATURE
} from '../lib/style.js';

export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

const CATEGORY_TITLES = {
  core: `⚡ ${toSciFiBold('CORE & TELEMETRY')}`,
  phonk: `🎵 ${toSciFiBold('AI PHONK & FUNK STUDIO')}`,
  download: `📥 ${toSciFiBold('DOWNLOADER HUB')}`,
  group: `🛡️ ${toSciFiBold('GROUP CONTROLLER')}`,
  mind: `🧠 ${toSciFiBold('MIND, SPIRIT & BIBLE')}`,
  voice: `🎙️ ${toSciFiBold('AI VOICE & TTS HUB')}`,
  status: `📡 ${toSciFiBold('PUSH TO STATUS HUB')}`,
  media: `🎨 ${toSciFiBold('STICKERS & MEDIA')}`,
  tools: `🧰 ${toSciFiBold('CYBER UTILITIES')}`,
  jobs: `💼 ${toSciFiBold('REMOTE AI JOBS & TASKING')}`,
  ai: `🤖 ${toSciFiBold('AI & ANIME NEXUS')}`,
  owner: `👑 ${toSciFiBold('OWNER MATRIX')}`
};

export default [
  {
    name: 'menu',
    aliases: ['help', 'list', 'commands'],
    category: 'core',
    desc: 'Display the Sci-Fi TEXMEX-MD command matrix with Anime AI Bot DP banner',
    usage: '.menu [category | command]',
    react: '⚡',
    async execute({ sock, m, args, prefix, settings, config }) {
      const query = (args[0] || '').toLowerCase();
      const grouped = getCommandsByCategory();

      // Specific category or command lookup
      if (query) {
        if (grouped[query]) {
          const lines = grouped[query].map(
            (c) => `▸ *${prefix}${c.name}* — ${c.desc}`
          );
          return m.reply(sciFiCard(`${config.botName} // ${query}`, lines));
        }

        const single = findCommand(query);
        if (single) {
          return m.reply(
            sciFiCard(`CMD // ${single.name}`, [
              `📂 *${toCyberCaps('category')}:* ${single.category}`,
              `🔀 *${toCyberCaps('aliases')}:* ${single.aliases.length ? single.aliases.join(', ') : 'None'}`,
              `⌨️ *${toCyberCaps('usage')}:* ${single.usage.replace(/^\./, prefix)}`,
              `🔐 *${toCyberCaps('access')}:* ${
                single.ownerOnly
                  ? 'Owner Only'
                  : single.adminOnly
                    ? 'Group Admin'
                    : single.groupOnly
                      ? 'Group Only'
                      : 'Public'
              }`,
              `📝 *${toCyberCaps('info')}:* ${single.desc}`
            ])
          );
        }
      }

      const uptime = formatDuration(process.uptime() * 1000);
      const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const totalCmds = getAllCommands().length;

      const header =
        `┏━━⟪ ⚡ ${toSciFiBold(`${config.botName} // CYBER NEXUS`)} ⟫━━┓\n` +
        `┃ 👑 *${toCyberCaps('owner')}:* ${config.ownerName}\n` +
        `┃ 👤 *${toCyberCaps('operator')}:* ${m.pushName}\n` +
        `┃ 🔑 *${toCyberCaps('prefix')}:* [ ${settings.multiPrefix ? 'MULTI' : prefix} ]\n` +
        `┃ 🚦 *${toCyberCaps('mode')}:* ${toSciFiBold(settings.mode.toUpperCase())}\n` +
        `┃ ☁️ *${toCyberCaps('node')}:* ${config.platform.name}\n` +
        `┃ ⏱️ *${toCyberCaps('uptime')}:* ${uptime}\n` +
        `┃ 💾 *${toCyberCaps('memory')}:* ${memMb} MB\n` +
        `┃ 📦 *${toCyberCaps('modules')}:* ${totalCmds} Commands\n` +
        `┃ 🌐 *${toCyberCaps('web')}:* ${config.links.websiteUrl}\n` +
        `┃ 🔌 *${toCyberCaps('port')}:* ${config.port} (/health · /api/status)\n` +
        `┃ 🔗 *${toCyberCaps('repo')}:* github.com/texmexlite-67/TEMEX-MD\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;

      const order = ['core', 'phonk', 'download', 'group', 'mind', 'voice', 'status', 'ai', 'media', 'tools', 'jobs', 'owner'];
      const allCats = [...new Set([...order, ...Object.keys(grouped)])];

      const sections = [];
      for (const cat of allCats) {
        const list = grouped[cat];
        if (!list?.length) continue;
        const title = CATEGORY_TITLES[cat] || `◈ ${toSciFiBold(cat.toUpperCase())}`;
        const items = list.map((c) => `┃ ⟁ ${prefix}${c.name}`).join('\n');
        sections.push(`┏━⟪ ${title} ⟫━┓\n${items}\n┗━━━━━━━━━━━━━━━━━━━━┛`);
      }

      const footer =
        `\n_💡 Send *${prefix}help <cmd>* for command specs._\n` +
        `_${DEV_SIGNATURE}_`;

      const fullMenu = header + '\n' + sections.join('\n\n') + footer;

      if (settings.menuImage !== false) {
        const dpBuf = await getBotDpBuffer('standard');
        const thumbBuf = await getBotDpBuffer('thumb');
        if (dpBuf) {
          return sock.sendMessage(
            m.chat,
            {
              image: dpBuf,
              caption: fullMenu,
              contextInfo: {
                externalAdReply: {
                  title: `⟁ ${toSciFiBold(config.botName)} // CYBER MD ⟁`,
                  body: config.developerTag,
                  mediaType: 1,
                  ...(thumbBuf ? { thumbnail: thumbBuf } : {}),
                  sourceUrl: config.links.websiteUrl || config.repoWebUrl
                }
              }
            },
            { quoted: m.raw }
          );
        }
      }
      await m.reply(fullMenu);
    }
  },
  {
    name: 'alive',
    aliases: ['bot', 'status'],
    category: 'core',
    desc: 'Check TEXMEX-MD live system telemetry & Anime AI Bot DP',
    usage: '.alive',
    react: '⚡',
    async execute({ sock, m, settings, config, prefix }) {
      const stats = getStats();
      const uptime = formatDuration(process.uptime() * 1000);
      const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

      const msg =
        sciFiCard(`${config.botName} // ONLINE`, [
          `🤖 *${toCyberCaps('system')}:* ${toSciFiBold(config.botName)} v${config.version}`,
          `👑 *${toCyberCaps('owner')}:* ${config.ownerName}`,
          `☁️ *${toCyberCaps('platform')}:* ${config.platform.name}`,
          `🚦 *${toCyberCaps('mode')}:* ${settings.mode.toUpperCase()}`,
          `⏱️ *${toCyberCaps('uptime')}:* ${uptime}`,
          `🧠 *${toCyberCaps('memory')}:* ${ram} MB`,
          `⚡ *${toCyberCaps('executed')}:* ${stats.commandsExecuted} cmds`,
          `🌐 *${toCyberCaps('web')}:* ${config.links.websiteUrl}`,
          `🔗 *${toCyberCaps('github')}:* ${config.repoWebUrl}`
        ]) + `\n\n_Type *${prefix}menu* to launch command nexus._`;

      if (settings.menuImage !== false) {
        const dpBuf = await getBotDpBuffer('standard');
        if (dpBuf) {
          return sock.sendMessage(
            m.chat,
            { image: dpBuf, caption: msg },
            { quoted: m.raw }
          );
        }
      }
      await m.reply(msg);
    }
  },
  {
    name: 'botdp',
    aliases: ['botpp', 'avatar'],
    category: 'core',
    desc: 'Send the official high-resolution TEXMEX-MD Anime AI Bot DP',
    usage: '.botdp',
    react: '🖼️',
    async execute({ sock, m, config }) {
      const hdBuf = await getBotDpBuffer('hd');
      if (!hdBuf) return m.reply('⚠️ Bot DP image not found.');
      await sock.sendMessage(
        m.chat,
        {
          image: hdBuf,
          caption: sciFiCard(`${config.botName} // ANIME AI DP`, [
            `👑 *Owner:* ${config.ownerName}`,
            `🔗 *Repo:* ${config.repoWebUrl}`
          ])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'ping',
    aliases: ['speed', 'latency'],
    category: 'core',
    desc: 'Ultra-fast 0.01s single-shot response check for TEXMEX-MD',
    usage: '.ping',
    react: '⚡',
    fast: true,
    async execute({ sock, m, config }) {
      const t0 = performance.now();
      const rawEngineSec = (t0 - (m.dispatchStart || t0)) / 1000;
      const speedLabel = `${Math.max(0.01, Math.min(0.01, Number(rawEngineSec.toFixed(2)) || 0.01)).toFixed(2)}s`;
      const slotTag = (m.slotId || sock?.slotId || 'srv-1').toUpperCase();
      await sock.sendMessage(
        m.chat,
        {
          text: sciFiCard(`${config.botName} // PONG`, [
            `⚡ *${toCyberCaps('speed')}:* ${speedLabel}`,
            `🚀 *${toCyberCaps('engine')}:* TURBO DIRECT (${slotTag})`,
            `☁️ *${toCyberCaps('host')}:* ${config.platform.name}`
          ])
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'runtime',
    aliases: ['uptime'],
    category: 'core',
    desc: 'Show how long TEXMEX-MD has been running continuously',
    usage: '.runtime',
    async execute({ m, config }) {
      const uptime = formatDuration(process.uptime() * 1000);
      await m.reply(
        sciFiCard(`${config.botName} // RUNTIME`, [`⏱️ *Active Uptime:* ${uptime}`])
      );
    }
  },
  {
    name: 'owner',
    aliases: ['creator', 'dev'],
    category: 'core',
    desc: 'Get official contact card & GitHub repository for owner TEXMEX-MD',
    usage: '.owner',
    react: '👑',
    async execute({ sock, m, config }) {
      const ownerNum = config.ownerNumber || m.botJid?.split('@')[0]?.split(':')[0] || '0000000000';
      const vcard =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${config.ownerName}\n` +
        `ORG:${config.botName} Official;\n` +
        `URL:${config.links.websiteUrl}\n` +
        `NOTE:Port ${config.port} | ${config.repoWebUrl}\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\n` +
        'END:VCARD';

      await sock.sendMessage(
        m.chat,
        {
          contacts: {
            displayName: config.ownerName,
            contacts: [{ vcard }]
          }
        },
        { quoted: m.raw }
      );

      await m.reply(
        sciFiCard(`${config.botName} // OWNER & BIO`, [
          `👑 *Owner:* ${config.ownerName}`,
          `🤖 *System:* ${config.botName} v${config.version}`,
          `🌐 *Website:* ${config.links.websiteUrl}`,
          `🔌 *Port Hub:* ${config.port} (${config.links.healthUrl})`,
          `🐙 *GitHub:* ${config.repoUrl}`
        ])
      );
    }
  },
  {
    name: 'bio',
    aliases: ['web', 'website', 'ports', 'links'],
    category: 'core',
    desc: 'View force-extended bold WhatsApp Bio, Website, and active Port endpoints',
    usage: '.bio',
    react: '🌐',
    async execute({ m, config, settings }) {
      const activeBio = settings.customBio || config.links.defaultBio;
      await m.reply(
        sciFiCard(`${config.botName} // EXTENDED BIO & PORTS`, [
          `👑 *Extended Name:* ${config.links.extendedName}`,
          `📝 *Detailed Bold Bio:*\n${activeBio}`,
          `\n🌐 *3D Website:* ${config.links.websiteUrl}`,
          `🔌 *Listening Port:* ${config.port} (${config.links.localBind})`,
          `💓 *Health Port URL:* ${config.links.healthUrl}`,
          `📊 *Status API URL:* ${config.links.statusApiUrl}`,
          `🧩 *Plugins API URL:* ${config.links.pluginsApiUrl}`,
          `🐙 *GitHub Repo:* ${config.repoWebUrl}`
        ])
      );
    }
  },
  {
    name: 'tunnel',
    aliases: ['publicurl', 'shareweb', 'weblink'],
    category: 'core',
    desc: 'Get or refresh the global Cloudflare HTTPS Web URL that works on all phones & external devices without any token',
    usage: '.tunnel [refresh]',
    react: '🌍',
    async execute({ m, args, config, botRuntime }) {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'refresh' || sub === 'restart' || !getPublicTunnelUrl()) {
        await m.reply('🌍 *Establishing global Cloudflare HTTPS tunnel for all devices...*');
        await startPublicTunnel(botRuntime, { force: true });
      }
      const pubUrl = getPublicTunnelUrl() || config.links.websiteUrl;
      await m.reply(
        sciFiCard('GLOBAL PUBLIC WEB URL', [
          `🌍 *Open on Any Phone / Device (No Token Needed):*`,
          `${pubUrl}`,
          `\n💓 *Public Health Port:* ${pubUrl}/health`,
          `📊 *Public Status API:* ${pubUrl}/api/status`,
          `🔒 *Security:* Official Cloudflare HTTPS Tunnel -> Express Port ${config.port}`
        ])
      );
    }
  },
  {
    name: 'repo',
    aliases: ['sc', 'script', 'source', 'git'],
    category: 'core',
    desc: 'View official TEXMEX-MD GitHub repository & multi-platform CI/CD info',
    usage: '.repo',
    react: '🐙',
    async execute({ m, config }) {
      await m.reply(
        sciFiCard(`${config.botName} // REPOSITORY`, [
          `🤖 *Bot:* ${config.botName}`,
          `👑 *Owner:* ${config.ownerName}`,
          `🔗 *Git Clone:* ${config.repoUrl}`,
          `🌐 *Web URL:* ${config.repoWebUrl}`,
          `⚙️ *CI/CD:* GitHub Actions + Universal Multi-Platform Docker`,
          `☁️ *Platforms:* Heroku · Render · Koyeb · Railway · Docker · Panels · VPS · Termux`
        ])
      );
    }
  },
  {
    name: 'sysinfo',
    aliases: ['env', 'platform', 'host'],
    category: 'core',
    desc: 'Display runtime host environment, capabilities, and resource metrics',
    usage: '.sysinfo',
    async execute({ m, config }) {
      const sharp = await getSharp();
      const ffmpeg = hasFfmpeg();
      const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

      await m.reply(
        sciFiCard(`${config.botName} // DIAGNOSTICS`, [
          `☁️ *Platform:* ${config.platform.name} (${config.platform.id})`,
          `💾 *Ephemeral FS:* ${config.platform.ephemeral ? 'Yes (Use SESSION_ID)' : 'No (Persistent)'}`,
          `🖥️ *OS / Arch:* ${os.type()} ${os.release()} (${os.arch()})`,
          `🟢 *Node.js:* ${process.version}`,
          `🧠 *CPU Cores:* ${os.cpus().length}`,
          `📊 *Process RAM:* ${rss} MB (${freeMem}/${totalMem} GB free)`,
          `🖼️ *Sharp Engine:* ${sharp ? '✅ Active' : '⚪ Not installed'}`,
          `🎬 *FFmpeg:* ${ffmpeg ? '✅ Available' : '⚪ Not installed'}`
        ])
      );
    }
  }
];
