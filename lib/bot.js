import fs from 'node:fs';
import path from 'node:path';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser
} from '@whiskeysockets/baileys';

import config from '../config.js';
import { cleanPhoneNumber } from './env.js';
import { logger, baileysLogger } from './logger.js';
import {
  hydrateSessionFromEnv,
  exportSessionId,
  decodeSessionString,
  clearSessionDir,
  hasSavedSession
} from './session.js';
import {
  groupCache,
  msgRetryCounterCache,
  getCachedMessage,
  getSettings,
  getSlotConfig,
  updateSlotConfig,
  getSavedSlotIds,
  registerContactJid,
  getFreezeState,
  isFrozenDm,
  consumeFrozenMessageKeys,
  recordLidPnMapping
} from './store.js';
import { syncAutoStatusScheduler } from './status-poster.js';
import { buildSubcategoryContent, dispatchSubcategoryItem } from './push-catalog.js';
import { toBoldPreservingUrls } from './style.js';
import {
  handleMessagesUpsert,
  handleGroupParticipantsUpdate,
  handleIncomingCalls
} from './handler.js';
import { extractNumber } from './serialize.js';
import { getBotDpBuffer, updateWhatsAppDp } from './avatar.js';

const DEFAULT_OPEN_SERVERS = Number.parseInt(process.env.OPEN_BOT_SERVERS || '10', 10) || 10;
const MAX_CLUSTER_SERVERS = Number.parseInt(process.env.MAX_BOT_SERVERS || '25', 10) || 25;

// Shared WA version cache across all cluster slots so boot is instant
let cachedWaVersion = null;
let cachedWaVersionAt = 0;

async function resolveSharedWaVersion() {
  if (cachedWaVersion && Date.now() - cachedWaVersionAt < 30 * 60 * 1000) {
    return cachedWaVersion;
  }
  try {
    const res = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    if (res?.version) {
      cachedWaVersion = res.version;
      cachedWaVersionAt = Date.now();
      return res.version;
    }
  } catch {
    // Fallback to Baileys built-in version tuple
  }
  return undefined;
}

export function maskPhoneForGrid(numStr = '') {
  const s = String(numStr || '').replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.length <= 6) return `+${s.slice(0, 2)}•••${s.slice(-2)}`;
  return `+${s.slice(0, 5)}•••${s.slice(-3)}`;
}

export class TexmexBotEngine {
  constructor({ slotId = 'srv-1', sessionDir = config.sessionDir, isPrimary = true } = {}) {
    this.slotId = slotId;
    this.sessionDir = sessionDir;
    this.isPrimary = Boolean(isPrimary);
    this.cluster = null;

    this.sock = null;
    this.reconnectTimer = null;
    this.idleParkTimer = null;
    this.autoPushTimer = null;
    this.autoPushCursor = 0;
    this.reconnectAttempts = 0;
    this.isShuttingDown = false;
    this.autoPairTriggered = false;

    const initialHasCreds = hasSavedSession(this.sessionDir);
    this.state = {
      status: config.disableWhatsApp
        ? 'disabled'
        : this.isPrimary || initialHasCreds
          ? 'initializing'
          : 'available',
      qrRaw: null,
      qrDataUrl: null,
      qrUpdatedAt: null,
      pairingCode: null,
      pairingPhone: null,
      pairingUpdatedAt: null,
      user: null,
      waVersion: null,
      lastError: null,
      connectedAt: null
    };
  }

  getLabel() {
    return getSlotConfig(this.slotId).label;
  }

  isOccupied() {
    return this.state.status === 'connected';
  }

  isFreeToGrab() {
    return (
      this.state.status !== 'connected' &&
      !hasSavedSession(this.sessionDir) &&
      !this.state.pairingCode
    );
  }

  getPublicState({ maskUser = false } = {}) {
    const settings = getSettings();
    const slotCfg = getSlotConfig(this.slotId);
    const userObj = this.state.user
      ? {
          ...this.state.user,
          maskedNumber: maskPhoneForGrid(this.state.user.number),
          ...(maskUser
            ? {
                id: undefined,
                lid: undefined,
                number: maskPhoneForGrid(this.state.user.number)
              }
            : {})
        }
      : null;

    return {
      slotId: this.slotId,
      slotLabel: slotCfg.label,
      isPrimary: this.isPrimary,
      botName: slotCfg.botName || config.botName,
      ownerName: config.ownerName,
      version: config.version,
      status: this.state.status,
      occupied: this.state.status === 'connected',
      freeToGrab: this.isFreeToGrab(),
      hasQr: Boolean(this.state.qrDataUrl),
      qrDataUrl: this.state.qrDataUrl,
      qrUpdatedAt: this.state.qrUpdatedAt,
      pairingCode: this.state.pairingCode,
      pairingPhone: this.state.pairingPhone ? maskPhoneForGrid(this.state.pairingPhone) : null,
      pairingUpdatedAt: this.state.pairingUpdatedAt,
      hasSavedCreds: hasSavedSession(this.sessionDir),
      user: userObj,
      waVersion: this.state.waVersion,
      lastError: this.state.lastError,
      connectedAt: this.state.connectedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      platform: config.platform,
      mode: slotCfg.mode || settings.mode,
      prefix: slotCfg.prefix || settings.prefix,
      multiPrefix: settings.multiPrefix,
      pushConfig: {
        tickedSubcategories: slotCfg.tickedSubcategories || [],
        autoPushEnabled: Boolean(slotCfg.autoPushEnabled),
        autoPushIntervalMins: Number(slotCfg.autoPushIntervalMins || 120),
        toStatus: slotCfg.toStatus !== false,
        toSelf: Boolean(slotCfg.toSelf),
        voice: slotCfg.voice || 'andrew'
      },
      freezeConfig: {
        selfFreeze: Boolean(slotCfg.selfFreeze),
        frozenUsersCount: Array.isArray(slotCfg.frozenUsers) ? slotCfg.frozenUsers.length : 0,
        frozenUsers: Array.isArray(slotCfg.frozenUsers) ? slotCfg.frozenUsers : []
      }
    };
  }

  async syncFreezePresence() {
    const sock = this.sock;
    if (!sock) return;
    const { selfFreeze, frozenUsers } = getFreezeState(this.slotId);
    const hasAnyFreeze = selfFreeze || (Array.isArray(frozenUsers) && frozenUsers.length > 0);
    try {
      if (hasAnyFreeze) {
        sock.ev.emit('connection.update', { isOnline: false });
        if (this.state.status === 'connected') {
          await sock.sendPresenceUpdate('unavailable').catch(() => {});
        }
      } else {
        sock.ev.emit('connection.update', { isOnline: true });
      }
    } catch {}
  }

  attachFreezeInterceptor(sock) {
    if (!sock) return;

    const evaluateStanzaFreeze = (stanza) => {
      const attrs = stanza?.attrs || {};
      const from = attrs.from || '';
      const participant = attrs.participant || '';
      const senderAlt =
        attrs.sender_pn ||
        attrs.participant_pn ||
        attrs.peer_recipient_pn ||
        attrs.sender_lid ||
        attrs.participant_lid ||
        attrs.peer_recipient_lid ||
        '';

      if (senderAlt && from) {
        recordLidPnMapping(from, senderAlt);
      }

      const isGroupStanza =
        Boolean(participant) ||
        from.endsWith('@g.us') ||
        from.endsWith('@newsletter') ||
        from === 'status@broadcast';

      if (isGroupStanza) {
        return false;
      }

      const check = isFrozenDm(this.slotId, {
        chatJid: from,
        senderJid: from,
        senderAlt,
        participantPn: attrs.participant_pn || attrs.sender_pn || '',
        isGroup: false,
        botNumber: this.state.user?.number || ''
      });
      return check.frozen;
    };

    const onIncomingFrame = (stanza) => {
      try {
        const shouldFreeze = evaluateStanzaFreeze(stanza);
        // Set immediately AND serialize inside Baileys' messageMutex so concurrent messages never race
        sock.ev.emit('connection.update', { isOnline: !shouldFreeze });
        if (sock.messageMutex?.mutex) {
          sock.messageMutex
            .mutex(async () => {
              sock.ev.emit('connection.update', { isOnline: !shouldFreeze });
            })
            .catch(() => {});
        }
      } catch {}
    };

    if (typeof sock.ws?.prependListener === 'function') {
      sock.ws.prependListener('CB:message', onIncomingFrame);
    } else if (typeof sock.ws?.on === 'function') {
      sock.ws.on('CB:message', onIncomingFrame);
    }

    const flushReadReceiptsForChat = async (chatJid) => {
      if (!chatJid) return;
      const pendingKeys = consumeFrozenMessageKeys(this.slotId, chatJid);
      if (pendingKeys.length > 0) {
        await sock.readMessages(pendingKeys).catch(() => {});
      }
    };

    // Instant 2-blue-tick release the exact moment the owner clicks/opens the received DM on WhatsApp
    sock.ev.on('chats.update', (updates) => {
      for (const u of updates || []) {
        if (u?.id && (u.unreadCount === 0 || u.markArchived === false)) {
          if (u.unreadCount === 0) {
            flushReadReceiptsForChat(u.id).catch(() => {});
          }
        }
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates || []) {
        const status = u?.update?.status;
        // WAMessageStatus.READ = 4, PLAYED = 5
        if (u?.key?.remoteJid && !u?.key?.fromMe && typeof status === 'number' && status >= 4) {
          flushReadReceiptsForChat(u.key.remoteJid).catch(() => {});
        }
      }
    });
  }

  armIdleParkTimer() {
    clearTimeout(this.idleParkTimer);
    if (this.isPrimary) return;
    // Park unclaimed secondary slots after 5 minutes of inactivity so 512MB cloud RAM stays ultra-low
    this.idleParkTimer = setTimeout(() => {
      if (this.state.status !== 'connected' && !hasSavedSession(this.sessionDir)) {
        this.parkIdle();
      }
    }, 5 * 60 * 1000);
    if (typeof this.idleParkTimer.unref === 'function') this.idleParkTimer.unref();
  }

  parkIdle() {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.idleParkTimer);
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock = null;
      }
    } catch {}
    this.state.status = 'available';
    this.state.qrRaw = null;
    this.state.qrDataUrl = null;
    this.state.pairingCode = null;
  }

  syncTickAutoPushScheduler() {
    if (this.autoPushTimer) {
      clearInterval(this.autoPushTimer);
      this.autoPushTimer = null;
    }
    const slotCfg = getSlotConfig(this.slotId);
    const ticks = Array.isArray(slotCfg.tickedSubcategories) ? slotCfg.tickedSubcategories : [];
    if (!slotCfg.autoPushEnabled || ticks.length === 0) return;

    const mins = Math.max(15, Number(slotCfg.autoPushIntervalMins) || 120);
    this.autoPushTimer = setInterval(async () => {
      try {
        if (!this.sock || this.state.status !== 'connected') return;
        const freshCfg = getSlotConfig(this.slotId);
        const list = freshCfg.tickedSubcategories || [];
        if (!freshCfg.autoPushEnabled || list.length === 0) return;

        const chosenId = list[this.autoPushCursor % list.length];
        this.autoPushCursor = (this.autoPushCursor + 1) % list.length;

        const built = await buildSubcategoryContent(chosenId, {
          voice: freshCfg.voice || 'andrew',
          webUrl: config.links?.websiteUrl
        });
        const res = await dispatchSubcategoryItem(this.sock, built, {
          toStatus: freshCfg.toStatus !== false,
          toSelf: Boolean(freshCfg.toSelf),
          selfJid: this.state.user?.id || ''
        });
        logger.success(
          'TICK-PUSH',
          `[${this.slotId.toUpperCase()}] Auto-pushed "${res.title}" to ${res.recipientsCount} contact(s)`
        );
      } catch (err) {
        logger.warn('TICK-PUSH', `[${this.slotId.toUpperCase()}] Scheduled tick push skipped: ${err.message}`);
      }
    }, mins * 60 * 1000);

    if (typeof this.autoPushTimer.unref === 'function') this.autoPushTimer.unref();
  }

  async start({ startAllCluster = true } = {}) {
    if (this.isPrimary && startAllCluster && this.cluster) {
      // Boot saved client slots in background too
      this.cluster.startSavedSecondarySlots().catch((err) => {
        logger.warn('CLUSTER', `Secondary slot restore note: ${err.message}`);
      });
    }

    if (config.disableWhatsApp) {
      if (this.isPrimary) {
        logger.warn('BOT', 'DISABLE_WA_CONNECT=true — running Web Dashboard in standalone mode.');
      }
      this.state.status = 'disabled';
      return;
    }

    this.isShuttingDown = false;
    clearTimeout(this.reconnectTimer);
    fs.mkdirSync(this.sessionDir, { recursive: true });

    if (this.isPrimary) {
      hydrateSessionFromEnv(this.sessionDir, config.sessionId, false);
    }

    try {
      this.state.status = 'connecting';
      const { state: authState, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const version = await resolveSharedWaVersion();
      if (version) this.state.waVersion = version.join('.');

      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.ws?.close();
        } catch {}
      }

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        logger: baileysLogger,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, baileysLogger)
        },
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        msgRetryCounterCache,
        cachedGroupMetadata: async (jid) => groupCache.get(jid),
        getMessage: async (key) => {
          const cached = getCachedMessage(key?.remoteJid, key?.id);
          return cached?.message || undefined;
        }
      });

      sock.slotId = this.slotId;
      this.sock = sock;
      this.attachFreezeInterceptor(sock);
      this.armIdleParkTimer();

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.state.status = 'awaiting_scan';
          this.state.qrRaw = qr;
          this.state.qrUpdatedAt = new Date().toISOString();
          this.armIdleParkTimer();
          try {
            this.state.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 340,
              margin: 2,
              color: { dark: '#0b0b0b', light: '#F5C400' }
            });
          } catch {
            this.state.qrDataUrl = null;
          }

          if (this.isPrimary && config.printQrInTerminal && !config.pairingNumber) {
            try {
              const termQr = await QRCode.toString(qr, { type: 'terminal', small: true });
              logger.info('QR', `[${this.slotId.toUpperCase()}] Scan QR in WhatsApp -> Linked Devices (or open Web Hub):`);
              console.log(termQr);
            } catch {}
          }

          if (this.isPrimary && config.pairingNumber && !authState.creds.registered && !this.autoPairTriggered) {
            this.autoPairTriggered = true;
            setTimeout(() => {
              this.requestPairing(config.pairingNumber, config.useCustomPairingCode).catch((err) => {
                logger.warn('PAIR', `Auto-pairing request failed: ${err.message}`);
              });
            }, 1500);
          }
        }

        if (connection === 'open') {
          clearTimeout(this.idleParkTimer);
          this.reconnectAttempts = 0;
          this.autoPairTriggered = false;
          this.state.status = 'connected';
          this.state.qrRaw = null;
          this.state.qrDataUrl = null;
          this.state.pairingCode = null;
          this.state.lastError = null;
          this.state.connectedAt = new Date().toISOString();

          const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
          this.state.user = {
            id: botJid,
            lid: sock.user?.lid || '',
            name: sock.user?.name || getSlotConfig(this.slotId).botName || config.botName,
            number: extractNumber(botJid)
          };

          logger.success(
            'WA',
            `[${this.slotId.toUpperCase()}] Connected as +${this.state.user.number} (${this.state.user.name})`
          );

          if (this.isPrimary) {
            syncAutoStatusScheduler(() => this.sock);
          }
          this.syncTickAutoPushScheduler();
          await this.syncFreezePresence();
          await this.sendWelcomeSessionNotice(sock, botJid);
        }

        if (connection === 'close') {
          const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
          const errMsg = lastDisconnect?.error?.message || `Code ${statusCode || 'unknown'}`;
          this.state.lastError = errMsg;

          if (this.isShuttingDown) {
            this.state.status = 'stopped';
            return;
          }

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            logger.warn('WA', `[${this.slotId.toUpperCase()}] Session logged out. Clearing slot credentials...`);
            clearSessionDir(this.sessionDir);
            this.state.user = null;
            this.autoPairTriggered = false;
            if (this.isPrimary) {
              this.state.status = 'logged_out';
              this.scheduleReconnect(3000);
            } else {
              this.parkIdle();
            }
          } else if (!this.isPrimary && !hasSavedSession(this.sessionDir) && this.reconnectAttempts >= 3) {
            // Unclaimed secondary slot QR expired -> park cleanly into FREE state
            this.parkIdle();
          } else {
            this.state.status = 'reconnecting';
            const delayMs = Math.min(30000, 2500 * Math.pow(1.4, Math.min(this.reconnectAttempts, 7)));
            this.reconnectAttempts += 1;
            logger.warn(
              'WA',
              `[${this.slotId.toUpperCase()}] Connection closed (${errMsg}). Reconnecting in ${(delayMs / 1000).toFixed(1)}s...`
            );
            this.scheduleReconnect(delayMs);
          }
        }
      });

      sock.ev.on('messages.upsert', (upsert) => {
        handleMessagesUpsert(sock, upsert, this).catch((err) => {
          logger.error('UPSERT', `[${this.slotId.toUpperCase()}] ${err.message}`);
        });
      });

      sock.ev.on('group-participants.update', (update) => {
        handleGroupParticipantsUpdate(sock, update).catch((err) => {
          logger.warn('GROUP', err.message);
        });
      });

      sock.ev.on('groups.update', (updates) => {
        for (const u of updates || []) {
          if (u.id) groupCache.del(u.id);
        }
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts || []) {
          const jid = c.phoneNumber || c.id;
          if (jid?.endsWith('@s.whatsapp.net')) registerContactJid(jid, this.slotId);
        }
      });
      sock.ev.on('contacts.update', (contacts) => {
        for (const c of contacts || []) {
          const jid = c.phoneNumber || c.id;
          if (jid?.endsWith('@s.whatsapp.net')) registerContactJid(jid, this.slotId);
        }
      });

      sock.ev.on('call', (calls) => {
        handleIncomingCalls(sock, calls).catch((err) => {
          logger.warn('CALL', err.message);
        });
      });
    } catch (err) {
      this.state.lastError = err.message;
      this.state.status = 'reconnecting';
      logger.error('BOT', `[${this.slotId.toUpperCase()}] Startup error: ${err.message}`);
      this.scheduleReconnect(5000);
    }
  }

  scheduleReconnect(delayMs) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isShuttingDown) {
        this.start({ startAllCluster: false });
      }
    }, delayMs);
    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  async sendWelcomeSessionNotice(sock, botJid) {
    if (!botJid) return;
    const settings = getSettings();
    const slotCfg = getSlotConfig(this.slotId);

    // Only auto-apply owner DP/Bio on Primary Server unless explicitly requested on client slot
    if (this.isPrimary) {
      const dpMarkerPath = path.join(this.sessionDir, '.dp-applied');
      if (settings.autoSetBotDp && !fs.existsSync(dpMarkerPath)) {
        try {
          const dpBuf = await getBotDpBuffer('standard');
          if (dpBuf) {
            await updateWhatsAppDp(sock, botJid, dpBuf);
            fs.writeFileSync(dpMarkerPath, new Date().toISOString(), 'utf8');
          }
        } catch {}
      }

      if (settings.autoSetBio !== false) {
        const nameMarkerPath = path.join(this.sessionDir, '.name-extended-v2');
        const targetName = config.links.extendedName;
        const prevName = fs.existsSync(nameMarkerPath)
          ? fs.readFileSync(nameMarkerPath, 'utf8').trim()
          : '';
        if (prevName !== targetName) {
          try {
            await sock.updateProfileName(targetName);
            if (this.state.user) this.state.user.name = targetName;
            fs.writeFileSync(nameMarkerPath, targetName, 'utf8');
          } catch {}
        }

        const bioMarkerPath = path.join(this.sessionDir, '.bio-extended-v2');
        const desiredKey = settings.customBio || config.links.defaultBio;
        const prevKey = fs.existsSync(bioMarkerPath)
          ? fs.readFileSync(bioMarkerPath, 'utf8').trim()
          : '';
        if (prevKey !== desiredKey) {
          try {
            await this.applyBotBio(settings.customBio || '');
            fs.writeFileSync(bioMarkerPath, desiredKey, 'utf8');
          } catch {}
        }
      }
    }

    if (!config.sendSessionOnConnect) return;
    const markerPath = path.join(this.sessionDir, '.connect-notified');
    if (fs.existsSync(markerPath)) return;

    try {
      const sessionStr = exportSessionId(this.sessionDir);
      const dpBuf = await getBotDpBuffer('standard');
      const welcomeCaption =
        `✅ *${slotCfg.botName || config.botName} CONNECTED ON ${this.slotId.toUpperCase()}!*\n\n` +
        `├ *Server Slot:* ${slotCfg.label}\n` +
        `├ *Mode:* ${(slotCfg.mode || settings.mode).toUpperCase()}\n` +
        `├ *Prefix:* ${slotCfg.prefix || settings.prefix}\n` +
        `├ *Push Menu:* Send *${slotCfg.prefix || '.'}pushmenu*\n` +
        `└ *Full Menu:* Send *${slotCfg.prefix || '.'}menu*\n\n` +
        `_Your isolated multi-server slot is active 24/7! Portable SESSION_ID backup below:_`;

      if (dpBuf) {
        await sock.sendMessage(botJid, { image: dpBuf, caption: welcomeCaption });
      } else {
        await sock.sendMessage(botJid, { text: welcomeCaption });
      }
      if (sessionStr) {
        await sock.sendMessage(botJid, { text: sessionStr });
      }
      fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
    } catch (err) {
      logger.warn('NOTIFY', `[${this.slotId.toUpperCase()}] Welcome DM skipped: ${err.message}`);
    }
  }

  async applyBotDp(customBuffer = null, { full = false } = {}) {
    if (!this.sock || this.state.status !== 'connected' || !this.state.user?.id) {
      throw new Error(`Link ${this.slotId.toUpperCase()} to WhatsApp first before applying the profile picture.`);
    }
    const buf = customBuffer || (await getBotDpBuffer('standard'));
    if (!buf) throw new Error('Bot DP image buffer not found.');
    await updateWhatsAppDp(this.sock, this.state.user.id, buf, { full });
    return true;
  }

  async applyProfileName(customName = '') {
    if (!this.sock || this.state.status !== 'connected') {
      throw new Error(`Link ${this.slotId.toUpperCase()} to WhatsApp first before updating profile name.`);
    }
    const styled = customName ? toBoldPreservingUrls(customName) : config.links.extendedName;
    await this.sock.updateProfileName(styled);
    if (this.state.user) this.state.user.name = styled;
    fs.writeFileSync(path.join(this.sessionDir, '.name-extended-v2'), styled, 'utf8');
    return styled;
  }

  async applyBotBio(customText = '') {
    if (!this.sock || this.state.status !== 'connected') {
      throw new Error(`Link ${this.slotId.toUpperCase()} to WhatsApp first before updating profile bio.`);
    }
    const rawCustom = String(customText || '').trim();
    if (rawCustom) {
      const boldBio = toBoldPreservingUrls(rawCustom);
      await this.sock.updateProfileStatus(boldBio);
      fs.writeFileSync(path.join(this.sessionDir, '.bio-applied'), boldBio, 'utf8');
      return boldBio;
    }
    const tiers = config.links.bioTiers || [config.links.defaultBio];
    let acceptedBio = tiers[0];
    for (const candidate of tiers) {
      try {
        await this.sock.updateProfileStatus(candidate);
        acceptedBio = candidate;
        break;
      } catch {}
    }
    fs.writeFileSync(path.join(this.sessionDir, '.bio-applied'), acceptedBio, 'utf8');
    return acceptedBio;
  }

  /**
   * Wake up an idle/available server slot so it generates a live scannable WhatsApp QR code.
   */
  async activateQrMode() {
    if (this.state.status === 'connected') {
      throw new Error(`${this.slotId.toUpperCase()} is already connected! Select a free server slot instead.`);
    }
    if (!this.sock || this.state.status === 'available' || this.state.status === 'stopped') {
      this.reconnectAttempts = 0;
      await this.start({ startAllCluster: false });
    }
    // Wait up to 6s for QR generation
    for (let i = 0; i < 15; i++) {
      if (this.state.qrDataUrl || this.state.status === 'connected') break;
      await new Promise((r) => setTimeout(r, 400));
    }
    return this.getPublicState();
  }

  /**
   * Request an 8-character WhatsApp Multi-Device Pairing Code on THIS server slot.
   */
  async requestPairing(rawPhone, useCustom = false) {
    const phone = cleanPhoneNumber(rawPhone);
    if (!phone || phone.length < 8 || phone.length > 16) {
      throw new Error('Enter a valid international phone number (e.g. 254712345678).');
    }

    if (this.state.status === 'connected') {
      throw new Error(
        `${this.slotId.toUpperCase()} is already occupied! Select an OPEN server slot so both accounts stay online.`
      );
    }

    if (hasSavedSession(this.sessionDir) && this.sock?.authState?.creds?.registered) {
      clearSessionDir(this.sessionDir);
      await this.start({ startAllCluster: false });
    } else if (!this.sock || this.state.status === 'available' || this.state.status === 'stopped') {
      this.reconnectAttempts = 0;
      await this.start({ startAllCluster: false });
    }

    for (let i = 0; i < 18; i++) {
      if (this.sock?.ws?.isOpen || this.state.qrRaw) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!this.sock) {
      throw new Error('Server slot socket is initializing. Please try again in 2 seconds.');
    }

    const customCode =
      useCustom && /^[0-9A-HJ-NP-TV-Z]{8}$/.test(config.customPairingCode)
        ? config.customPairingCode
        : undefined;

    const code = await this.sock.requestPairingCode(phone, customCode);
    const formatted = code?.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

    this.state.pairingCode = formatted;
    this.state.pairingPhone = phone;
    this.state.pairingUpdatedAt = new Date().toISOString();
    this.armIdleParkTimer();

    logger.success('PAIRING', `[${this.slotId.toUpperCase()}] Pairing code for +${phone}: ${formatted}`);
    return { slotId: this.slotId, slotLabel: this.getLabel(), phone, code: formatted };
  }

  exportSlotSession() {
    return exportSessionId(this.sessionDir);
  }

  async importSession(sessionString) {
    const jsonText = decodeSessionString(sessionString);
    clearSessionDir(this.sessionDir);
    fs.mkdirSync(this.sessionDir, { recursive: true });
    fs.writeFileSync(path.join(this.sessionDir, 'creds.json'), jsonText, 'utf8');
    logger.success('SESSION', `[${this.slotId.toUpperCase()}] Imported TEXMEX-MD~ session; connecting...`);
    await this.restart();
    return true;
  }

  async resetSession() {
    try {
      if (this.sock && this.state.status === 'connected') {
        await this.sock.logout().catch(() => {});
      }
    } catch {}
    clearSessionDir(this.sessionDir);
    this.state.user = null;
    this.state.pairingCode = null;
    this.state.qrDataUrl = null;
    this.autoPairTriggered = false;
    if (this.isPrimary) {
      await this.restart();
    } else {
      this.parkIdle();
    }
  }

  async restart() {
    clearTimeout(this.reconnectTimer);
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock = null;
      }
    } catch {}
    await this.start({ startAllCluster: false });
  }

  async stop({ stopAllCluster = true } = {}) {
    if (this.isPrimary && stopAllCluster && this.cluster) {
      await this.cluster.stopAllSecondarySlots();
    }
    this.isShuttingDown = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.idleParkTimer);
    if (this.autoPushTimer) {
      clearInterval(this.autoPushTimer);
      this.autoPushTimer = null;
    }
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock = null;
      }
    } catch {}
    this.state.status = 'stopped';
  }
}

/**
 * Multi-Server Bot Cluster Manager:
 * Keeps numerous independent WhatsApp Bot Server Slots open simultaneously so
 * clients & members can grab their own server without ever logging out +254715442684 or other users!
 */
class TexmexClusterManager {
  constructor() {
    this.slots = new Map();
    this.clusterDir = path.join(config.sessionDir, 'cluster');
    fs.mkdirSync(this.clusterDir, { recursive: true });

    // Slot 1 = Primary Core (uses root config.sessionDir for 100% compatibility with existing sessions)
    const primary = new TexmexBotEngine({
      slotId: 'srv-1',
      sessionDir: config.sessionDir,
      isPrimary: true
    });
    primary.cluster = this;
    this.slots.set('srv-1', primary);
    this.primary = primary;

    // Discover any previously saved slots > DEFAULT_OPEN_SERVERS
    let highestSlotNum = DEFAULT_OPEN_SERVERS;
    try {
      for (const entry of fs.readdirSync(this.clusterDir, { withFileTypes: true })) {
        if (entry.isDirectory() && /^srv-\d+$/i.test(entry.name)) {
          const n = Number(entry.name.split('-')[1]);
          if (n > highestSlotNum && n <= MAX_CLUSTER_SERVERS) highestSlotNum = n;
        }
      }
      for (const id of getSavedSlotIds()) {
        if (/^srv-\d+$/i.test(id)) {
          const n = Number(id.split('-')[1]);
          if (n > highestSlotNum && n <= MAX_CLUSTER_SERVERS) highestSlotNum = n;
        }
      }
    } catch {}

    // Pre-open SRV-02 .. SRV-10 (or highestSlotNum) in zero-RAM "available" state
    for (let i = 2; i <= highestSlotNum; i++) {
      this.ensureSlot(`srv-${i}`);
    }
  }

  ensureSlot(slotId) {
    const cleanId = String(slotId || 'srv-1').toLowerCase().trim();
    if (this.slots.has(cleanId)) return this.slots.get(cleanId);

    const num = Number(cleanId.replace(/[^0-9]/g, ''));
    if (!num || num < 1 || num > MAX_CLUSTER_SERVERS) {
      throw new Error(`Invalid server slot ID (allowed srv-1 through srv-${MAX_CLUSTER_SERVERS}).`);
    }
    const slotDir = num === 1 ? config.sessionDir : path.join(this.clusterDir, `srv-${num}`);
    const engine = new TexmexBotEngine({
      slotId: `srv-${num}`,
      sessionDir: slotDir,
      isPrimary: num === 1
    });
    engine.cluster = this;
    getSlotConfig(`srv-${num}`);
    this.slots.set(`srv-${num}`, engine);
    return engine;
  }

  getSlot(slotId) {
    if (!slotId) return this.primary;
    const cleanId = String(slotId).toLowerCase().trim();
    return this.slots.get(cleanId) || null;
  }

  spawnNewSlot(customLabel = '') {
    if (this.slots.size >= MAX_CLUSTER_SERVERS) {
      throw new Error(`Maximum cluster limit (${MAX_CLUSTER_SERVERS} servers) reached.`);
    }
    let nextNum = 2;
    while (this.slots.has(`srv-${nextNum}`)) nextNum++;
    const slotId = `srv-${nextNum}`;
    const engine = this.ensureSlot(slotId);
    if (customLabel && String(customLabel).trim()) {
      updateSlotConfig(slotId, {
        label: `SRV-${String(nextNum).padStart(2, '0')} // ${String(customLabel).trim().toUpperCase().slice(0, 24)}`
      });
    }
    logger.success('CLUSTER', `Opened new client bot server slot: ${slotId.toUpperCase()}`);
    return engine;
  }

  findOrSpawnFreeSlot(preferredSlotId = '') {
    if (preferredSlotId && preferredSlotId !== 'auto') {
      const pref = this.getSlot(preferredSlotId);
      if (pref && pref.state.status !== 'connected') {
        return { engine: pref, autoAssigned: false };
      }
    }
    // Prefer completely clean available secondary slots first (SRV-02..SRV-10+) so SRV-01 stays dedicated if desired, or any free slot
    for (const [id, eng] of this.slots.entries()) {
      if (id !== 'srv-1' && eng.isFreeToGrab()) {
        return { engine: eng, autoAssigned: Boolean(preferredSlotId && preferredSlotId !== id) };
      }
    }
    for (const [id, eng] of this.slots.entries()) {
      if (eng.state.status !== 'connected' && !hasSavedSession(eng.sessionDir)) {
        return { engine: eng, autoAssigned: Boolean(preferredSlotId && preferredSlotId !== id) };
      }
    }
    const spawned = this.spawnNewSlot();
    return { engine: spawned, autoAssigned: true };
  }

  async requestPairingSmart({ slotId = 'auto', phone, useCustom = false, autoAssignFree = true }) {
    let target = slotId && slotId !== 'auto' ? this.getSlot(slotId) : null;
    let autoAssigned = false;

    // If requested slot is already connected (e.g. +254715442684 on SRV-01), NEVER block or log out — auto-grab free server!
    if (!target || target.state.status === 'connected') {
      if (!autoAssignFree && target?.state.status === 'connected') {
        throw new Error(`${target.slotId.toUpperCase()} is occupied. Pick a free server slot.`);
      }
      const picked = this.findOrSpawnFreeSlot(slotId);
      target = picked.engine;
      autoAssigned = picked.autoAssigned || slotId === 'auto';
    }

    const res = await target.requestPairing(phone, useCustom);
    return { ...res, autoAssigned };
  }

  getClusterOverview({ maskNumbers = true } = {}) {
    const servers = Array.from(this.slots.values()).map((eng) =>
      eng.getPublicState({ maskUser: maskNumbers })
    );
    const connectedCount = servers.filter((s) => s.status === 'connected').length;
    const freeCount = servers.filter((s) => s.status !== 'connected').length;
    return {
      totalServers: servers.length,
      maxServers: MAX_CLUSTER_SERVERS,
      connectedCount,
      freeCount,
      servers
    };
  }

  async startSavedSecondarySlots() {
    for (const [id, eng] of this.slots.entries()) {
      if (id === 'srv-1') continue;
      if (hasSavedSession(eng.sessionDir)) {
        logger.info('CLUSTER', `Restoring saved client session on ${id.toUpperCase()}...`);
        eng.start({ startAllCluster: false }).catch((err) => {
          logger.warn('CLUSTER', `[${id.toUpperCase()}] Restore error: ${err.message}`);
        });
        await new Promise((r) => setTimeout(r, 600));
      } else {
        eng.syncTickAutoPushScheduler();
      }
    }
  }

  async stopAllSecondarySlots() {
    for (const [id, eng] of this.slots.entries()) {
      if (id === 'srv-1') continue;
      await eng.stop({ stopAllCluster: false }).catch(() => {});
    }
  }
}

export const botCluster = new TexmexClusterManager();
export const botEngine = botCluster.primary;
export default botEngine;
