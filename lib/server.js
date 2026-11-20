import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import axios from 'axios';
import config from '../config.js';
import { logger } from './logger.js';
import { getPluginSummary } from './plugins.js';
import { exportSessionId } from './session.js';
import { getSettings, updateSettings, getStats } from './store.js';
import { hasFfmpeg, getSharp } from './env.js';
import {
  SCI_FI_ENDPOINT_TITLE,
  DEV_SIGNATURE,
  DEV_SIGNATURE_PLAIN,
  OFFICIAL_WEB_URL
} from './style.js';
import { askTexmexAi } from './ai.js';
import {
  pushContentToStatus,
  generateBrandedQrPoster,
  generateMotivationContent,
  generateQuoteContent,
  generatePsychologyContent,
  generateBibleContent,
  generateSpiritualContent,
  generatePrayerContent
} from './status-poster.js';
import { generateSpecializedPrayer } from './prayer-engine.js';
import { generateSpeechAudio } from './tts.js';
import {
  STUDIO_ROOT,
  PHONK_GENRES,
  PHONK_MOODS,
  enhancePromptWithAi,
  generatePhonkStudioBundle,
  getStudioTrackPaths
} from './phonk-studio.js';
import { getPublicTunnelUrl, startPublicTunnel } from './tunnel.js';

function checkDashboardAuth(req, res, next) {
  if (!config.dashboardKey) return next();
  const provided =
    req.headers['x-dashboard-key'] ||
    req.query?.key ||
    req.body?.dashboardKey ||
    '';
  if (provided === config.dashboardKey) return next();
  return res.status(401).json({
    ok: false,
    error: 'Dashboard key required. Enter DASHBOARD_KEY in the top-right unlock field.'
  });
}

export function createWebServer(botEngine) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Universal permissive headers for cloud proxies & live previews
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Cloud Keep-Alive & Platform Health Checks (Render, Koyeb, Railway, Heroku, Docker, UptimeRobot)
  app.get(['/health', '/healthz', '/ping'], (req, res) => {
    const st = botEngine.getPublicState();
    res.status(200).json({
      ok: true,
      title: SCI_FI_ENDPOINT_TITLE,
      bot: config.botName,
      owner: config.ownerName,
      developer: DEV_SIGNATURE_PLAIN,
      signature: DEV_SIGNATURE,
      repository: config.repoUrl,
      links: config.links,
      version: config.version,
      whatsappStatus: st.status,
      platform: config.platform.id,
      uptimeSeconds: st.uptimeSeconds,
      timestamp: new Date().toISOString()
    });
  });

  // Public Telemetry & Pairing State
  app.get('/api/status', async (req, res) => {
    const sharp = await getSharp();
    res.json({
      ok: true,
      title: SCI_FI_ENDPOINT_TITLE,
      developer: DEV_SIGNATURE_PLAIN,
      signature: DEV_SIGNATURE,
      repository: config.repoUrl,
      links: config.links,
      publicTunnelUrl: getPublicTunnelUrl() || null,
      locked: Boolean(config.dashboardKey),
      state: botEngine.getPublicState(),
      stats: getStats(),
      settings: getSettings(),
      capabilities: {
        sharp: Boolean(sharp),
        ffmpeg: hasFfmpeg(),
        node: process.version
      }
    });
  });

  // Refresh or Launch Global Cloudflare HTTPS Public Tunnel
  app.post('/api/tunnel/refresh', checkDashboardAuth, async (req, res) => {
    try {
      const url = await startPublicTunnel(botEngine, { force: true });
      if (!url) {
        return res.status(503).json({
          ok: false,
          error: 'Could not establish Cloudflare tunnel right now. Please try again in a few seconds.'
        });
      }
      res.json({
        ok: true,
        publicTunnelUrl: url,
        links: config.links
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Searchable Plugin & Command Catalog
  app.get('/api/plugins', (req, res) => {
    res.json({
      ok: true,
      title: SCI_FI_ENDPOINT_TITLE,
      developer: DEV_SIGNATURE_PLAIN,
      repository: config.repoUrl,
      ...getPluginSummary()
    });
  });

  // Recent Runtime Logs
  app.get('/api/logs', checkDashboardAuth, (req, res) => {
    res.json({
      ok: true,
      logs: logger.getRecentLogs(120)
    });
  });

  // Request 8-Digit / Branded Pairing Code
  app.post('/api/pair', checkDashboardAuth, async (req, res) => {
    try {
      const { phone, useCustom } = req.body || {};
      const result = await botEngine.requestPairing(phone, Boolean(useCustom));
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Export Active TEXMEX-MD~ Session ID
  app.get('/api/session', checkDashboardAuth, (req, res) => {
    const sessionId = exportSessionId(config.sessionDir);
    if (!sessionId) {
      return res.status(404).json({
        ok: false,
        error: 'No active session found yet. Pair via QR or Pairing Code first.'
      });
    }
    res.json({ ok: true, sessionId });
  });

  // Import Existing TEXMEX-MD~ Session ID
  app.post('/api/session/import', checkDashboardAuth, async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      await botEngine.importSession(sessionId);
      res.json({ ok: true, message: 'Session imported! Connecting to WhatsApp...' });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Reset Session / Switch Number
  app.post('/api/session/reset', checkDashboardAuth, async (req, res) => {
    try {
      await botEngine.resetSession();
      res.json({ ok: true, message: 'Session cleared. Ready for new QR or Pairing Code.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Restart Socket
  app.post('/api/restart', checkDashboardAuth, async (req, res) => {
    try {
      botEngine.restart();
      res.json({ ok: true, message: 'TEXMEX-MD socket restarting...' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Apply Official TEXMEX-MD Anime AI Bot DP to Connected WhatsApp Account
  app.post('/api/botdp/apply', checkDashboardAuth, async (req, res) => {
    try {
      await botEngine.applyBotDp();
      res.json({ ok: true, message: 'TEXMEX-MD Anime AI DP applied to WhatsApp profile!' });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Sync Force-Extended Name + Bold Bio + Website & Port Links to WhatsApp Profile
  app.post('/api/bio/apply', checkDashboardAuth, async (req, res) => {
    try {
      const customText = String(req.body?.bio || '').trim();
      const customName = String(req.body?.name || '').trim();
      if (customText) {
        updateSettings({ customBio: customText === 'default' ? '' : customText });
      }
      const nameApplied = await botEngine
        .applyProfileName(customName === 'default' ? '' : customName)
        .catch(() => config.links.extendedName);
      const applied = await botEngine.applyBotBio(customText === 'default' ? '' : customText);
      res.json({ ok: true, name: nameApplied, bio: applied });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Live Conversational AI Endpoint for 3D Web Nexus & Oracle
  app.post('/api/ai', checkDashboardAuth, async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required.' });
      const reply = await askTexmexAi(prompt, {
        userKey: 'web-nexus-oracle',
        useMemory: true
      });
      res.json({ ok: true, reply });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Live Bible-Extracted Specialized Prayer Generator Endpoint
  app.post('/api/prayer', checkDashboardAuth, async (req, res) => {
    try {
      const type = String(req.body?.type || 'self').trim();
      const note = String(req.body?.note || '').trim();
      const prayer = await generateSpecializedPrayer(type, note);
      res.json({ ok: true, prayer });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // AI Neural Text-to-Speech (Bible / Prayer / Motivation / Custom Text -> Ready-to-Listen MP3)
  app.post('/api/tts', checkDashboardAuth, async (req, res) => {
    try {
      const category = String(req.body?.category || '').toLowerCase().trim();
      const topic = String(req.body?.topic || '').trim();
      const voice = String(req.body?.voice || getSettings().ttsVoice || 'andrew').trim();
      let script = String(req.body?.text || '').trim();

      if (!script && category) {
        if (category === 'bible') script = await generateBibleContent(topic);
        else if (category === 'prayer') script = await generatePrayerContent(topic);
        else if (category === 'motivate' || category === 'motivation') script = await generateMotivationContent(topic);
        else if (category === 'psych' || category === 'psychology') script = await generatePsychologyContent(topic);
        else if (category === 'quote') script = await generateQuoteContent(topic);
        else if (category === 'spiritual') script = await generateSpiritualContent(topic);
      }
      if (!script) {
        return res.status(400).json({ ok: false, error: 'Provide text or choose a category (bible, prayer, motivate, quote, psych).' });
      }

      const ttsRes = await generateSpeechAudio(script, { voice, preferOpusPtt: Boolean(req.body?.pushToStatus) });

      let pushedInfo = null;
      if (req.body?.pushToStatus) {
        if (!botEngine.sock || botEngine.state.status !== 'connected') {
          return res.status(400).json({ ok: false, error: 'WhatsApp is not connected yet.' });
        }
        const statusMime = ttsRes.mimetype === 'audio/mpeg' ? 'audio/mp4' : ttsRes.mimetype;
        pushedInfo = await pushContentToStatus(botEngine.sock, {
          audio: ttsRes.buffer,
          mimetype: statusMime,
          ptt: true
        });
      }

      res.json({
        ok: true,
        script,
        spokenText: ttsRes.spokenText,
        voice: ttsRes.voice,
        voiceLabel: ttsRes.voiceLabel,
        engine: ttsRes.engine,
        audioDataUrl: `data:audio/mpeg;base64,${ttsRes.mp3Buffer.toString('base64')}`,
        pushedToStatus: Boolean(pushedInfo),
        recipientsCount: pushedInfo?.recipientsCount || 0
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Push Text or Generated Category (Bible / Prayer / Motivation / Psych / Quote) to WhatsApp Status
  app.post('/api/status/push', checkDashboardAuth, async (req, res) => {
    try {
      if (!botEngine.sock || botEngine.state.status !== 'connected') {
        return res.status(400).json({
          ok: false,
          error: 'WhatsApp is not connected yet. Link your number in Bot Hub first.'
        });
      }
      const category = String(req.body?.category || '').toLowerCase().trim();
      const topic = String(req.body?.topic || '').trim();
      let statusText = String(req.body?.text || '').trim();

      if (category === 'qr' || category === 'webqr') {
        const targetUrl = topic || OFFICIAL_WEB_URL;
        const posterBuf = await generateBrandedQrPoster(targetUrl);
        const caption =
          statusText ||
          `⚡ *𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝟯𝗗 𝗡𝗘𝗫𝗨𝗦* ⚡\n` +
            `📲 *Scan QR or tap below to launch the 3D Web Hub:*\n` +
            `🌐 ${targetUrl}\n\n` +
            `🧠 24/7 AI · 📖 Bible & Prayers · 🎙️ Neural Voice\n` +
            `_${DEV_SIGNATURE}_`;

        const result = await pushContentToStatus(botEngine.sock, {
          image: posterBuf,
          caption
        });

        if (req.body?.sendToSelf && botEngine.state.user?.id) {
          await botEngine.sock
            .sendMessage(botEngine.state.user.id, {
              image: posterBuf,
              caption
            })
            .catch(() => {});
        }

        return res.json({
          ok: true,
          type: 'qr_image',
          url: targetUrl,
          recipientsCount: result.recipientsCount,
          preview: caption
        });
      }

      if (!statusText && category) {
        if (category === 'bible') statusText = await generateBibleContent(topic);
        else if (category === 'prayer') statusText = await generatePrayerContent(topic);
        else if (category === 'motivate' || category === 'motivation') statusText = await generateMotivationContent(topic);
        else if (category === 'psych' || category === 'psychology') statusText = await generatePsychologyContent(topic);
        else if (category === 'quote') statusText = await generateQuoteContent(topic);
        else if (category === 'spiritual') statusText = await generateSpiritualContent(topic);
      }

      if (!statusText) {
        return res.status(400).json({ ok: false, error: 'Provide status text or select a category.' });
      }

      const result = await pushContentToStatus(botEngine.sock, { text: statusText });
      res.json({
        ok: true,
        recipientsCount: result.recipientsCount,
        preview: statusText
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Update Runtime Bot Settings from Web Control Center
  app.post('/api/settings', checkDashboardAuth, (req, res) => {
    const allowed = [
      'prefix',
      'multiPrefix',
      'mode',
      'cooldownSeconds',
      'chatbotMode',
      'autoVoice',
      'ttsVoice',
      'autoRead',
      'autoStatusView',
      'autoStatusReact',
      'statusReactEmoji',
      'autoTyping',
      'antiDelete',
      'antiCall',
      'menuImage',
      'autoSetBotDp'
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body && key in req.body) {
        patch[key] = req.body[key];
      }
    }
    const updated = updateSettings(patch);
    res.json({ ok: true, settings: updated });
  });

  // =========================================================================
  // AI PHONK & 2020s BRAZILIAN FUNK STUDIO ENDPOINTS (MP3 + MP4 + ANIME THEME)
  // =========================================================================
  app.get('/api/phonk/presets', (req, res) => {
    res.json({
      ok: true,
      genres: Object.values(PHONK_GENRES).map((g) => ({
        id: g.id,
        label: g.label,
        shortLabel: g.shortLabel,
        defaultBpm: g.defaultBpm,
        minBpm: g.minBpm,
        maxBpm: g.maxBpm,
        defaultChant: g.defaultChant
      })),
      moods: Object.values(PHONK_MOODS).map((m) => ({
        id: m.id,
        label: m.label,
        primaryHex: m.primaryHex,
        secondaryHex: m.secondaryHex
      }))
    });
  });

  app.post('/api/phonk/enhance', checkDashboardAuth, async (req, res) => {
    try {
      const blueprint = await enhancePromptWithAi({
        prompt: req.body?.prompt || '',
        bpm: req.body?.bpm,
        genre: req.body?.genre || 'brazilian_funk',
        mood: req.body?.mood || 'energetic',
        customVocals: req.body?.customVocals || ''
      });
      res.json({ ok: true, blueprint });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/phonk/generate', checkDashboardAuth, async (req, res) => {
    try {
      const bundle = await generatePhonkStudioBundle({
        prompt: req.body?.prompt || '',
        bpm: req.body?.bpm,
        genre: req.body?.genre || 'brazilian_funk',
        mood: req.body?.mood || 'energetic',
        includeVocals: req.body?.includeVocals !== false,
        customVocals: req.body?.customVocals || ''
      });

      let pushedInfo = null;
      if (req.body?.pushToStatus) {
        if (!botEngine.sock || botEngine.state.status !== 'connected') {
          return res.status(400).json({ ok: false, error: 'WhatsApp is not connected yet.' });
        }
        const mp4Buf = fs.readFileSync(bundle.paths.mp4Path);
        pushedInfo = await pushContentToStatus(botEngine.sock, {
          video: mp4Buf,
          caption:
            `🎵 *${bundle.title}*\n` +
            `💿 *${bundle.album}* (${bundle.bpm} BPM · ${bundle.genreLabel})\n` +
            `_${DEV_SIGNATURE}_`
        });
      }

      const { paths, ...publicBundle } = bundle;
      res.json({
        ok: true,
        track: publicBundle,
        pushedToStatus: Boolean(pushedInfo),
        recipientsCount: pushedInfo?.recipientsCount || 0
      });
    } catch (err) {
      logger.error('PHONK-STUDIO', `Studio generation failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/phonk/download/:trackId/:asset', (req, res) => {
    const info = getStudioTrackPaths(req.params.trackId);
    if (!info) {
      return res.status(404).json({ ok: false, error: 'Studio track not found or expired.' });
    }
    const asset = String(req.params.asset || '').toLowerCase();
    const slug = info.meta.slug || 'texmex-phonk';
    if (asset === 'mp4' || asset === 'video' || asset === 'visualizer') {
      return res.download(info.mp4Path, `${slug}-visualizer.mp4`);
    }
    if (asset === 'mp3' || asset === 'audio') {
      return res.download(info.mp3Path, `${slug}.mp3`);
    }
    if (asset === 'theme' || asset === 'bg' || asset === 'cover') {
      return res.download(info.themePath, `${slug}-anime-theme.jpg`);
    }
    return res.status(400).json({ ok: false, error: 'Invalid asset type. Use mp4, mp3, or theme.' });
  });

  // Serve rendered Phonk Studio streams & Web Dashboard static UI
  app.use('/studio', express.static(STUDIO_ROOT));
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

export function startKeepAliveLoop() {
  if (!config.keepAliveUrl || config.keepAliveIntervalMs < 60000) return null;
  const target = `${config.keepAliveUrl.replace(/\/+$/, '')}/health`;
  logger.info('KEEPALIVE', `Cloud self-ping active -> ${target} every ${Math.round(config.keepAliveIntervalMs / 60000)}m`);

  const timer = setInterval(() => {
    axios.get(target, { timeout: 10000 }).catch(() => {});
  }, config.keepAliveIntervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}
