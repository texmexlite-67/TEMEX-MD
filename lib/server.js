import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import axios from 'axios';
import config from '../config.js';
import { logger } from './logger.js';
import { getPluginSummary } from './plugins.js';
import { exportSessionId } from './session.js';
import {
  getSettings,
  updateSettings,
  getSlotConfig,
  updateSlotConfig,
  getStats,
  getFreezeState,
  setSelfFreeze,
  addFrozenUser,
  removeFrozenUser
} from './store.js';
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
import {
  PUSH_CATEGORIES,
  PUSH_SUBCATEGORIES,
  findSubcategory,
  buildSubcategoryContent,
  dispatchSubcategoryItem
} from './push-catalog.js';
import { generateSpecializedPrayer } from './prayer-engine.js';
import { generateSpeechAudio } from './tts.js';
import {
  STUDIO_ROOT,
  MIN_PRODUCTION_SECONDS,
  PHONK_GENRES,
  PHONK_MOODS,
  PHONK_TYPES,
  PHONK_EFFECTS,
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

function resolveTargetEngine(botEngine, requestedSlotId) {
  const cluster = botEngine?.cluster;
  if (!cluster || !requestedSlotId) return botEngine;
  return cluster.getSlot(requestedSlotId) || botEngine;
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

  // Cloud Keep-Alive & Platform Health Checks
  app.get(['/health', '/healthz', '/ping'], (req, res) => {
    const st = botEngine.getPublicState();
    const clusterInfo = botEngine.cluster ? botEngine.cluster.getClusterOverview({ maskNumbers: true }) : null;
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
      cluster: clusterInfo
        ? {
            totalServers: clusterInfo.totalServers,
            connectedCount: clusterInfo.connectedCount,
            freeCount: clusterInfo.freeCount
          }
        : undefined,
      platform: config.platform.id,
      uptimeSeconds: st.uptimeSeconds,
      timestamp: new Date().toISOString()
    });
  });

  // Public Telemetry, Selected Slot State & Full Multi-Server Cluster Overview
  app.get('/api/status', async (req, res) => {
    const sharp = await getSharp();
    const target = resolveTargetEngine(botEngine, req.query?.slotId);
    const clusterOverview = botEngine.cluster
      ? botEngine.cluster.getClusterOverview({ maskNumbers: true })
      : {
          totalServers: 1,
          maxServers: 1,
          connectedCount: stIsConnected(target) ? 1 : 0,
          freeCount: stIsConnected(target) ? 0 : 1,
          servers: [target.getPublicState()]
        };

    res.json({
      ok: true,
      title: SCI_FI_ENDPOINT_TITLE,
      developer: DEV_SIGNATURE_PLAIN,
      signature: DEV_SIGNATURE,
      repository: config.repoUrl,
      links: config.links,
      publicTunnelUrl: getPublicTunnelUrl() || null,
      locked: Boolean(config.dashboardKey),
      state: target.getPublicState({ maskUser: false }),
      cluster: clusterOverview,
      stats: getStats(),
      settings: getSettings(),
      capabilities: {
        sharp: Boolean(sharp),
        ffmpeg: hasFfmpeg(),
        node: process.version
      }
    });
  });

  // =========================================================================
  // MULTI-SERVER BOT CLUSTER ENDPOINTS (OPEN SERVERS FOR CLIENTS & MEMBERS)
  // =========================================================================
  app.get('/api/servers', (req, res) => {
    if (!botEngine.cluster) {
      return res.json({
        ok: true,
        totalServers: 1,
        maxServers: 1,
        connectedCount: 0,
        freeCount: 1,
        servers: [botEngine.getPublicState()]
      });
    }
    res.json({
      ok: true,
      ...botEngine.cluster.getClusterOverview({ maskNumbers: true })
    });
  });

  app.post('/api/servers/grab', (req, res) => {
    try {
      if (!botEngine.cluster) {
        return res.json({ ok: true, slot: botEngine.getPublicState(), autoAssigned: false });
      }
      const picked = botEngine.cluster.findOrSpawnFreeSlot(req.body?.preferredSlotId || '');
      res.json({
        ok: true,
        slot: picked.engine.getPublicState(),
        autoAssigned: picked.autoAssigned,
        cluster: botEngine.cluster.getClusterOverview({ maskNumbers: true })
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/servers/spawn', checkDashboardAuth, (req, res) => {
    try {
      if (!botEngine.cluster) {
        return res.status(400).json({ ok: false, error: 'Cluster mode unavailable.' });
      }
      const engine = botEngine.cluster.spawnNewSlot(req.body?.label || '');
      res.json({
        ok: true,
        slot: engine.getPublicState(),
        cluster: botEngine.cluster.getClusterOverview({ maskNumbers: true })
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/server/qr', checkDashboardAuth, async (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'auto').trim();
      let target = resolveTargetEngine(botEngine, slotId === 'auto' ? '' : slotId);
      let autoAssigned = false;

      if (botEngine.cluster && (slotId === 'auto' || target.state?.status === 'connected')) {
        const picked = botEngine.cluster.findOrSpawnFreeSlot(slotId);
        target = picked.engine;
        autoAssigned = true;
      }

      const st = typeof target.activateQrMode === 'function'
        ? await target.activateQrMode()
        : target.getPublicState();

      res.json({
        ok: true,
        autoAssigned,
        slotId: target.slotId || 'srv-1',
        state: st
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/server/config', checkDashboardAuth, (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const patch = {};
      if (req.body?.label !== undefined) {
        const cleanLbl = String(req.body.label).trim().slice(0, 36);
        if (cleanLbl) patch.label = cleanLbl;
      }
      if (req.body?.botName !== undefined) {
        const cleanName = String(req.body.botName).trim().slice(0, 40);
        if (cleanName) patch.botName = cleanName;
      }
      if (req.body?.prefix !== undefined) {
        const cleanPref = String(req.body.prefix).trim().slice(0, 3);
        if (cleanPref) patch.prefix = cleanPref;
      }
      if (req.body?.mode && ['public', 'private'].includes(req.body.mode)) {
        patch.mode = req.body.mode;
      }
      const updated = updateSlotConfig(slotId, patch);
      res.json({ ok: true, slotConfig: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── DM Freeze Shield API (Self Freeze & User Freeze) ──
  app.get('/api/freeze', checkDashboardAuth, (req, res) => {
    const slotId = String(req.query?.slotId || 'srv-1').trim();
    res.json({ ok: true, freeze: getFreezeState(slotId) });
  });

  app.post('/api/freeze/self', checkDashboardAuth, async (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const target = resolveTargetEngine(botEngine, slotId);
      const cur = getFreezeState(slotId);
      const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !cur.selfFreeze;
      const freeze = setSelfFreeze(slotId, enabled);
      await target.syncFreezePresence?.();
      res.json({ ok: true, freeze });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/freeze/user', checkDashboardAuth, async (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const target = resolveTargetEngine(botEngine, slotId);
      const rawPhone = String(req.body?.phone || req.body?.number || '').trim();
      const label = String(req.body?.label || '').trim();
      const added = addFrozenUser(slotId, { number: rawPhone, jid: rawPhone.includes('@') ? rawPhone : '', label });
      if (!added) {
        return res.status(400).json({ ok: false, error: 'Enter a valid WhatsApp phone number (with country code).' });
      }
      await target.syncFreezePresence?.();
      res.json({ ok: true, ...added, freeze: getFreezeState(slotId) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/freeze/unfreeze', checkDashboardAuth, async (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const target = resolveTargetEngine(botEngine, slotId);
      const who = String(req.body?.target || req.body?.phone || 'all').trim();
      const removed = removeFrozenUser(slotId, who);
      await target.syncFreezePresence?.();
      res.json({ ok: true, ...removed, freeze: getFreezeState(slotId) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // BEGINNER TICKABLE SUB-CATEGORY PUSH WORKFLOW ENDPOINTS
  // =========================================================================
  app.get('/api/push/catalog', (req, res) => {
    const slotId = String(req.query?.slotId || 'srv-1').trim();
    res.json({
      ok: true,
      slotId,
      slotConfig: getSlotConfig(slotId),
      categories: PUSH_CATEGORIES,
      subcategories: PUSH_SUBCATEGORIES
    });
  });

  app.post('/api/push/preview', checkDashboardAuth, async (req, res) => {
    try {
      const rawList = Array.isArray(req.body?.subcategories) ? req.body.subcategories : [];
      const customNote = String(req.body?.customNote || '').trim();
      const chosen = rawList.map(findSubcategory).filter(Boolean).slice(0, 6);
      if (chosen.length === 0) {
        return res.status(400).json({ ok: false, error: 'Tick at least 1 sub-category first.' });
      }

      const previews = [];
      for (const sub of chosen) {
        if (sub.kind === 'audio') {
          // Fast text preview for voice subcategories without waiting for audio encoding
          const baseId =
            sub.id === 'voice_prayer' ? 'morning_prayer' :
            sub.id === 'voice_bible' ? 'bible_promise' :
            sub.id === 'voice_psych' ? 'cognitive_bias' : 'morning_discipline';
          const built = await buildSubcategoryContent(baseId, { customNote });
          previews.push({
            id: sub.id,
            num: sub.num,
            title: sub.title,
            tag: sub.tag,
            kind: 'audio',
            preview: `🎙️ [Spoken Neural Voice Script]\n${built.previewText}`
          });
        } else if (sub.kind === 'image_qr') {
          previews.push({
            id: sub.id,
            num: sub.num,
            title: sub.title,
            tag: sub.tag,
            kind: 'image_qr',
            preview: `📲 [1080×1350 Sci-Fi QR Invite Poster] Links contacts directly to ${OFFICIAL_WEB_URL} so they can claim a free bot server!`
          });
        } else {
          const built = await buildSubcategoryContent(sub.id, { customNote });
          previews.push({
            id: sub.id,
            num: sub.num,
            title: sub.title,
            tag: sub.tag,
            kind: built.kind,
            preview: built.previewText
          });
        }
      }

      res.json({ ok: true, previews });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/push/execute', checkDashboardAuth, async (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const target = resolveTargetEngine(botEngine, slotId);
      if (!target.sock || target.state?.status !== 'connected') {
        return res.status(400).json({
          ok: false,
          error: `Server ${slotId.toUpperCase()} is not connected to WhatsApp yet. Pair your number on ${slotId.toUpperCase()} first (or switch to your connected server slot)!`
        });
      }

      const rawList = Array.isArray(req.body?.subcategories) ? req.body.subcategories : [];
      const chosen = rawList.map(findSubcategory).filter(Boolean).slice(0, 8);
      if (chosen.length === 0) {
        return res.status(400).json({ ok: false, error: 'Tick at least one sub-category checkbox to push.' });
      }

      const toStatus = req.body?.toStatus !== false;
      const toSelf = Boolean(req.body?.toSelf);
      if (!toStatus && !toSelf) {
        return res.status(400).json({ ok: false, error: 'Tick at least one destination (WhatsApp Status or Self DM).' });
      }

      const voice = String(req.body?.voice || getSlotConfig(slotId).voice || 'andrew').trim();
      const customNote = String(req.body?.customNote || '').trim();

      // Persist ticked selection for beginner convenience
      updateSlotConfig(slotId, {
        tickedSubcategories: chosen.map((c) => c.id),
        toStatus,
        toSelf,
        voice
      });

      const results = [];
      for (const sub of chosen) {
        const built = await buildSubcategoryContent(sub.id, {
          customNote,
          voice,
          webUrl: config.links?.websiteUrl || OFFICIAL_WEB_URL
        });
        const pushed = await dispatchSubcategoryItem(target.sock, built, {
          toStatus,
          toSelf,
          selfJid: target.state?.user?.id || ''
        });
        results.push(pushed);
      }

      res.json({
        ok: true,
        slotId: target.slotId || slotId,
        pushedCount: results.length,
        results
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/push/schedule', checkDashboardAuth, (req, res) => {
    try {
      const slotId = String(req.body?.slotId || 'srv-1').trim();
      const target = resolveTargetEngine(botEngine, slotId);
      const rawList = Array.isArray(req.body?.subcategories) ? req.body.subcategories : [];
      const chosen = rawList.map(findSubcategory).filter(Boolean);
      const enabled = Boolean(req.body?.enabled);

      if (enabled && chosen.length === 0) {
        return res.status(400).json({ ok: false, error: 'Tick at least 1 sub-category before enabling Auto-Push.' });
      }

      const updated = updateSlotConfig(slotId, {
        ...(chosen.length > 0 ? { tickedSubcategories: chosen.map((c) => c.id) } : {}),
        autoPushEnabled: enabled,
        autoPushIntervalMins: Math.max(15, Number(req.body?.intervalMinutes) || 120),
        toStatus: req.body?.toStatus !== false,
        toSelf: Boolean(req.body?.toSelf),
        voice: String(req.body?.voice || 'andrew').trim()
      });

      target.syncTickAutoPushScheduler?.();
      res.json({ ok: true, slotConfig: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // PAIRING, VAULT, TUNNEL & DIAGNOSTICS ENDPOINTS
  // =========================================================================
  app.post('/api/tunnel/refresh', checkDashboardAuth, async (req, res) => {
    try {
      const url = await startPublicTunnel(botEngine, { force: true });
      if (!url) {
        return res.status(503).json({
          ok: false,
          error: 'Could not establish Cloudflare tunnel right now. Please try again in a few seconds.'
        });
      }
      res.json({ ok: true, publicTunnelUrl: url, links: config.links });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/plugins', (req, res) => {
    res.json({
      ok: true,
      title: SCI_FI_ENDPOINT_TITLE,
      developer: DEV_SIGNATURE_PLAIN,
      repository: config.repoUrl,
      ...getPluginSummary()
    });
  });

  app.get('/api/logs', checkDashboardAuth, (req, res) => {
    res.json({
      ok: true,
      logs: logger.getRecentLogs(120)
    });
  });

  // Smart Multi-Server 8-Digit Pairing Code Endpoint:
  // Automatically routes new clients to a FREE server slot if the selected slot (e.g. SRV-01 +254715442684) is already connected!
  app.post('/api/pair', checkDashboardAuth, async (req, res) => {
    try {
      const { phone, useCustom, slotId, autoAssignFree } = req.body || {};
      if (botEngine.cluster) {
        const result = await botEngine.cluster.requestPairingSmart({
          slotId: slotId || 'auto',
          phone,
          useCustom: Boolean(useCustom),
          autoAssignFree: autoAssignFree !== false
        });
        return res.json({
          ok: true,
          ...result,
          cluster: botEngine.cluster.getClusterOverview({ maskNumbers: true })
        });
      }
      const result = await botEngine.requestPairing(phone, Boolean(useCustom));
      res.json({ ok: true, slotId: 'srv-1', ...result });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/session', checkDashboardAuth, (req, res) => {
    const target = resolveTargetEngine(botEngine, req.query?.slotId);
    const sessionId = typeof target.exportSlotSession === 'function'
      ? target.exportSlotSession()
      : exportSessionId(config.sessionDir);

    if (!sessionId) {
      return res.status(404).json({
        ok: false,
        error: `No active session saved on ${(target.slotId || 'srv-1').toUpperCase()} yet. Pair via 8-Digit Code or QR first.`
      });
    }
    res.json({ ok: true, slotId: target.slotId || 'srv-1', sessionId });
  });

  app.post('/api/session/import', checkDashboardAuth, async (req, res) => {
    try {
      const { sessionId, slotId } = req.body || {};
      let target = resolveTargetEngine(botEngine, slotId);
      if (botEngine.cluster && target.state?.status === 'connected' && !req.body?.forceOverwrite) {
        target = botEngine.cluster.findOrSpawnFreeSlot().engine;
      }
      await target.importSession(sessionId);
      res.json({
        ok: true,
        slotId: target.slotId || 'srv-1',
        message: `Session imported onto ${(target.slotId || 'srv-1').toUpperCase()}! Connecting to WhatsApp...`
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/session/reset', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
      await target.resetSession();
      res.json({
        ok: true,
        slotId: target.slotId || 'srv-1',
        message: `Cleared session on ${(target.slotId || 'srv-1').toUpperCase()}. Slot is now free for pairing.`
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/restart', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
      target.restart();
      res.json({ ok: true, message: `Restarting ${(target.slotId || 'srv-1').toUpperCase()} socket...` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/botdp/apply', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
      await target.applyBotDp();
      res.json({ ok: true, message: `Anime AI Bot DP applied on ${(target.slotId || 'srv-1').toUpperCase()}!` });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/bio/apply', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
      const customText = String(req.body?.bio || '').trim();
      const customName = String(req.body?.name || '').trim();
      if (customText && target.isPrimary) {
        updateSettings({ customBio: customText === 'default' ? '' : customText });
      }
      const nameApplied = await target
        .applyProfileName(customName === 'default' ? '' : customName)
        .catch(() => config.links.extendedName);
      const applied = await target.applyBotBio(customText === 'default' ? '' : customText);
      res.json({ ok: true, name: nameApplied, bio: applied });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

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

  app.post('/api/tts', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
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
        return res.status(400).json({ ok: false, error: 'Provide text or choose a category.' });
      }

      const ttsRes = await generateSpeechAudio(script, { voice, preferOpusPtt: Boolean(req.body?.pushToStatus) });

      let pushedInfo = null;
      if (req.body?.pushToStatus) {
        if (!target.sock || target.state?.status !== 'connected') {
          return res.status(400).json({ ok: false, error: `WhatsApp is not connected on ${(target.slotId || 'srv-1').toUpperCase()} yet.` });
        }
        const statusMime = ttsRes.mimetype === 'audio/mpeg' ? 'audio/mp4' : ttsRes.mimetype;
        pushedInfo = await pushContentToStatus(target.sock, {
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

  app.post('/api/status/push', checkDashboardAuth, async (req, res) => {
    try {
      const target = resolveTargetEngine(botEngine, req.body?.slotId);
      if (!target.sock || target.state?.status !== 'connected') {
        return res.status(400).json({
          ok: false,
          error: `WhatsApp is not connected on ${(target.slotId || 'srv-1').toUpperCase()} yet.`
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
          `⚡ *𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗡𝗘𝗫𝗨𝗦 𝗖𝗢𝗠𝗠* ⚡\n` +
            `📲 *Scan QR or open to grab a free Bot Server:*\n` +
            `🌐 ${targetUrl}\n\n` +
            `_${DEV_SIGNATURE}_`;

        const result = await pushContentToStatus(target.sock, {
          image: posterBuf,
          caption
        });

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

      const result = await pushContentToStatus(target.sock, { text: statusText });
      res.json({
        ok: true,
        recipientsCount: result.recipientsCount,
        preview: statusText
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

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
  // AI PHONK & 2020s BRAZILIAN FUNK STUDIO ENDPOINTS
  // =========================================================================
  app.get('/api/phonk/presets', (req, res) => {
    res.json({
      ok: true,
      minDurationSec: MIN_PRODUCTION_SECONDS,
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
      })),
      types: Object.values(PHONK_TYPES).map((t) => ({
        id: t.id,
        label: t.label
      })),
      effects: Object.values(PHONK_EFFECTS).map((e) => ({
        id: e.id,
        label: e.label
      }))
    });
  });

  app.post('/api/phonk/enhance', checkDashboardAuth, async (req, res) => {
    try {
      const blueprint = await enhancePromptWithAi({
        prompt: req.body?.prompt || '',
        bpm: req.body?.bpm,
        genre: req.body?.genre || 'brazilian_funk',
        mood: req.body?.mood || 'hypnotic',
        type: req.body?.type || 'no_batidao_cd',
        effect: req.body?.effect || 'none',
        customVocals: req.body?.customVocals || ''
      });
      res.json({ ok: true, blueprint });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  const phonkJobs = new Map();

  app.post('/api/phonk/generate', checkDashboardAuth, async (req, res) => {
    const target = resolveTargetEngine(botEngine, req.body?.slotId);
    const vocalMode = String(req.body?.vocalMode || 'auto_aligned').trim();
    const genOpts = {
      prompt: req.body?.prompt || '',
      bpm: req.body?.bpm,
      genre: req.body?.genre || 'brazilian_funk',
      mood: req.body?.mood || 'hypnotic',
      type: req.body?.type || 'no_batidao_cd',
      effect: req.body?.effect || 'none',
      durationSec: req.body?.durationSec || 168,
      includeVocals: req.body?.includeVocals !== false && vocalMode !== 'cd_no_batidao',
      vocalMode,
      customVocals: req.body?.customVocals || ''
    };
    const wantPush = Boolean(req.body?.pushToStatus);

    if (req.body?.asyncJob) {
      if (wantPush && (!target.sock || target.state?.status !== 'connected')) {
        return res.status(400).json({ ok: false, error: `WhatsApp is not connected on ${(target.slotId || 'srv-1').toUpperCase()} yet.` });
      }
      const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const jobState = {
        jobId,
        status: 'running',
        phase: 'Booting AI Phonk Studio engine...',
        percent: 5,
        mp3Ready: false,
        partialTrack: null,
        track: null,
        pushedToStatus: false,
        recipientsCount: 0,
        error: null,
        createdAt: Date.now()
      };
      phonkJobs.set(jobId, jobState);

      for (const [k, v] of phonkJobs.entries()) {
        if (Date.now() - v.createdAt > 20 * 60 * 1000) phonkJobs.delete(k);
      }

      (async () => {
        try {
          const bundle = await generatePhonkStudioBundle({
            ...genOpts,
            onProgress: (p) => {
              jobState.phase = p.phase || jobState.phase;
              jobState.percent = p.percent || jobState.percent;
              if (p.mp3Ready && p.partialTrack) {
                const { paths: _p, ...pubPartial } = p.partialTrack;
                jobState.mp3Ready = true;
                jobState.partialTrack = {
                  ...pubPartial,
                  urls: {
                    mp3Stream: `/studio/${pubPartial.trackId}/track.mp3`,
                    themeImage: `/studio/${pubPartial.trackId}/theme.jpg`,
                    mp3Download: `/api/phonk/download/${pubPartial.trackId}/mp3`,
                    themeDownload: `/api/phonk/download/${pubPartial.trackId}/theme`
                  }
                };
              }
            }
          });

          let pushedInfo = null;
          if (wantPush && target.sock && target.state?.status === 'connected') {
            jobState.phase = 'Pushing full Visualizer MP4 to WhatsApp Status...';
            jobState.percent = 95;
            const mp4Buf = fs.readFileSync(bundle.paths.mp4Path);
            pushedInfo = await pushContentToStatus(target.sock, {
              video: mp4Buf,
              caption:
                `🎵 *${bundle.title}*\n` +
                `💿 *${bundle.album}* (${bundle.durationSec}s · ${bundle.effectiveBpm} BPM · ${bundle.moodLabel})\n` +
                `_${DEV_SIGNATURE}_`
            });
          }

          const { paths, ...publicBundle } = bundle;
          jobState.track = publicBundle;
          jobState.pushedToStatus = Boolean(pushedInfo);
          jobState.recipientsCount = pushedInfo?.recipientsCount || 0;
          jobState.percent = 100;
          jobState.phase = 'Complete!';
          jobState.status = 'done';
        } catch (err) {
          logger.error('PHONK-STUDIO', `Async studio generation failed: ${err.message}`);
          jobState.status = 'error';
          jobState.error = err.message || 'Phonk generation failed.';
        }
      })();

      return res.json({ ok: true, asyncJob: true, jobId });
    }

    try {
      const bundle = await generatePhonkStudioBundle(genOpts);
      let pushedInfo = null;
      if (wantPush) {
        if (!target.sock || target.state?.status !== 'connected') {
          return res.status(400).json({ ok: false, error: 'WhatsApp is not connected yet.' });
        }
        const mp4Buf = fs.readFileSync(bundle.paths.mp4Path);
        pushedInfo = await pushContentToStatus(target.sock, {
          video: mp4Buf,
          caption:
            `🎵 *${bundle.title}*\n` +
            `💿 *${bundle.album}* (${bundle.durationSec}s · ${bundle.effectiveBpm} BPM · ${bundle.moodLabel})\n` +
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

  app.get('/api/phonk/job/:jobId', checkDashboardAuth, (req, res) => {
    const job = phonkJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Studio job not found or expired.' });
    return res.json({ ok: true, ...job });
  });

  app.get('/api/phonk/download/:trackId/:asset', (req, res) => {
    const trackId = String(req.params.trackId || '');
    if (!/^[a-z0-9-]+$/i.test(trackId)) {
      return res.status(400).json({ ok: false, error: 'Invalid track ID.' });
    }
    const info = getStudioTrackPaths(trackId);
    const fallbackDir = path.join(STUDIO_ROOT, trackId);
    const mp4Path = info?.mp4Path || path.join(fallbackDir, 'visualizer.mp4');
    const mp3Path = info?.mp3Path || path.join(fallbackDir, 'track.mp3');
    const themePath = info?.themePath || path.join(fallbackDir, 'theme.jpg');
    const slug = info?.meta?.slug || `texmex-phonk-${trackId}`;

    const asset = String(req.params.asset || '').toLowerCase();
    if (asset === 'mp4' || asset === 'video' || asset === 'visualizer') {
      if (!fs.existsSync(mp4Path)) return res.status(404).json({ ok: false, error: 'MP4 still rendering or expired.' });
      return res.download(mp4Path, `${slug}-visualizer.mp4`);
    }
    if (asset === 'mp3' || asset === 'audio') {
      if (!fs.existsSync(mp3Path)) return res.status(404).json({ ok: false, error: 'MP3 not found or expired.' });
      return res.download(mp3Path, `${slug}.mp3`);
    }
    if (asset === 'theme' || asset === 'bg' || asset === 'cover') {
      if (!fs.existsSync(themePath)) return res.status(404).json({ ok: false, error: 'Theme image not found.' });
      return res.download(themePath, `${slug}-anime-theme.jpg`);
    }
    return res.status(400).json({ ok: false, error: 'Invalid asset type. Use mp4, mp3, or theme.' });
  });

  // Serve rendered Phonk Studio streams & Web Dashboard static UI
  app.use('/studio', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }, express.static(STUDIO_ROOT));

  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

function stIsConnected(eng) {
  return eng?.getPublicState?.()?.status === 'connected';
}

export function startKeepAliveLoop() {
  if (!config.keepAliveUrl) return null;
  const intervalMs = Math.max(60000, config.keepAliveIntervalMinutes * 60 * 1000);
  logger.info('KEEPALIVE', `Self-pinging ${config.keepAliveUrl} every ${config.keepAliveIntervalMinutes}m`);
  const timer = setInterval(() => {
    axios.get(config.keepAliveUrl, { timeout: 10000 }).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}
