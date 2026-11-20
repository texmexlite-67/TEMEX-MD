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
  registerContactJid
} from './store.js';
import { syncAutoStatusScheduler } from './status-poster.js';
import { toBoldPreservingUrls } from './style.js';
import {
  handleMessagesUpsert,
  handleGroupParticipantsUpdate,
  handleIncomingCalls
} from './handler.js';
import { extractNumber } from './serialize.js';
import { getBotDpBuffer, updateWhatsAppDp } from './avatar.js';

class TexmexBotEngine {
  constructor() {
    this.sock = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.isShuttingDown = false;
    this.autoPairTriggered = false;

    this.state = {
      status: config.disableWhatsApp ? 'disabled' : 'initializing',
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

  getPublicState() {
    const settings = getSettings();
    return {
      botName: config.botName,
      ownerName: config.ownerName,
      version: config.version,
      status: this.state.status,
      hasQr: Boolean(this.state.qrDataUrl),
      qrDataUrl: this.state.qrDataUrl,
      qrUpdatedAt: this.state.qrUpdatedAt,
      pairingCode: this.state.pairingCode,
      pairingPhone: this.state.pairingPhone,
      pairingUpdatedAt: this.state.pairingUpdatedAt,
      hasSavedCreds: hasSavedSession(config.sessionDir),
      user: this.state.user,
      waVersion: this.state.waVersion,
      lastError: this.state.lastError,
      connectedAt: this.state.connectedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      platform: config.platform,
      mode: settings.mode,
      prefix: settings.prefix,
      multiPrefix: settings.multiPrefix
    };
  }

  async resolveWaVersion() {
    try {
      const res = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      if (res?.version) return res.version;
    } catch {
      // Fallback to stable known WA Web version tuple
    }
    return undefined;
  }

  async start() {
    if (config.disableWhatsApp) {
      logger.warn('BOT', 'DISABLE_WA_CONNECT=true — running Web Dashboard in standalone mode.');
      this.state.status = 'disabled';
      return;
    }

    this.isShuttingDown = false;
    clearTimeout(this.reconnectTimer);

    // Hydrate credentials from SESSION_ID env var if present
    hydrateSessionFromEnv(config.sessionDir, config.sessionId, false);

    try {
      this.state.status = 'connecting';
      const { state: authState, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const version = await this.resolveWaVersion();
      if (version) this.state.waVersion = version.join('.');

      // Close previous socket cleanly if any
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.ws?.close();
        } catch {
          // ignore
        }
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

      this.sock = sock;

      // Persist updated credentials automatically
      sock.ev.on('creds.update', saveCreds);

      // Connection lifecycle handler
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.state.status = 'awaiting_scan';
          this.state.qrRaw = qr;
          this.state.qrUpdatedAt = new Date().toISOString();
          try {
            this.state.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 340,
              margin: 2,
              color: { dark: '#0b141a', light: '#ffffff' }
            });
          } catch {
            this.state.qrDataUrl = null;
          }

          if (config.printQrInTerminal && !config.pairingNumber) {
            try {
              const termQr = await QRCode.toString(qr, { type: 'terminal', small: true });
              logger.info('QR', 'Scan the QR code below in WhatsApp -> Linked Devices (or open the Web Dashboard):');
              console.log(termQr);
            } catch {
              // ignore terminal QR error
            }
          }

          // Auto-trigger headless ENV pairing code if PAIRING_NUMBER is configured
          if (config.pairingNumber && !authState.creds.registered && !this.autoPairTriggered) {
            this.autoPairTriggered = true;
            setTimeout(() => {
              this.requestPairing(config.pairingNumber, config.useCustomPairingCode).catch((err) => {
                logger.warn('PAIR', `Auto-pairing request failed: ${err.message}`);
              });
            }, 1500);
          }
        }

        if (connection === 'open') {
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
            name: sock.user?.name || config.botName,
            number: extractNumber(botJid)
          };

          logger.success(
            'WA',
            `${config.botName} connected as +${this.state.user.number} (${this.state.user.name}) on ${config.platform.name}`
          );

          syncAutoStatusScheduler(() => this.sock);
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
            logger.warn('WA', 'Session logged out from WhatsApp. Clearing local credentials and awaiting new pairing...');
            clearSessionDir(config.sessionDir);
            this.state.user = null;
            this.state.status = 'logged_out';
            this.autoPairTriggered = false;
            this.scheduleReconnect(3000);
          } else {
            this.state.status = 'reconnecting';
            const delayMs = Math.min(30000, 2500 * Math.pow(1.4, Math.min(this.reconnectAttempts, 7)));
            this.reconnectAttempts += 1;
            logger.warn(
              'WA',
              `Connection closed (${errMsg}). Reconnecting in ${(delayMs / 1000).toFixed(1)}s (attempt #${this.reconnectAttempts})...`
            );
            this.scheduleReconnect(delayMs);
          }
        }
      });

      // Incoming messages & commands
      sock.ev.on('messages.upsert', (upsert) => {
        handleMessagesUpsert(sock, upsert, this).catch((err) => {
          logger.error('UPSERT', err.message);
        });
      });

      // Group participant updates (Welcome / Goodbye)
      sock.ev.on('group-participants.update', (update) => {
        handleGroupParticipantsUpdate(sock, update).catch((err) => {
          logger.warn('GROUP', err.message);
        });
      });

      // Group metadata updates cache sync
      sock.ev.on('groups.update', (updates) => {
        for (const u of updates || []) {
          if (u.id) groupCache.del(u.id);
        }
      });

      // Sync contacts into Status Push audience
      sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts || []) {
          const jid = c.phoneNumber || c.id;
          if (jid?.endsWith('@s.whatsapp.net')) registerContactJid(jid);
        }
      });
      sock.ev.on('contacts.update', (contacts) => {
        for (const c of contacts || []) {
          const jid = c.phoneNumber || c.id;
          if (jid?.endsWith('@s.whatsapp.net')) registerContactJid(jid);
        }
      });

      // Incoming calls (Anti-Call)
      sock.ev.on('call', (calls) => {
        handleIncomingCalls(sock, calls).catch((err) => {
          logger.warn('CALL', err.message);
        });
      });
    } catch (err) {
      this.state.lastError = err.message;
      this.state.status = 'reconnecting';
      logger.error('BOT', `Startup error: ${err.message}`);
      this.scheduleReconnect(5000);
    }
  }

  scheduleReconnect(delayMs) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isShuttingDown) {
        this.start();
      }
    }, delayMs);
    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  async sendWelcomeSessionNotice(sock, botJid) {
    if (!botJid) return;
    const settings = getSettings();

    // Auto-apply TEXMEX-MD Anime AI Bot DP once per session if enabled
    const dpMarkerPath = path.join(config.sessionDir, '.dp-applied');
    if (settings.autoSetBotDp && !fs.existsSync(dpMarkerPath)) {
      try {
        const dpBuf = await getBotDpBuffer('standard');
        if (dpBuf) {
          await updateWhatsAppDp(sock, botJid, dpBuf);
          fs.writeFileSync(dpMarkerPath, new Date().toISOString(), 'utf8');
          logger.success('BOTDP', 'Applied TEXMEX-MD Anime AI Profile Picture to WhatsApp account!');
        }
      } catch (err) {
        logger.warn('BOTDP', `Auto Bot DP skipped: ${err.message}`);
      }
    }

    // Auto-sync Extended Profile Name ("TEXMEX") + Force-Extended Bold Bio + Port/Website Links
    if (settings.autoSetBio !== false) {
      const nameMarkerPath = path.join(config.sessionDir, '.name-extended-v2');
      const targetName = config.links.extendedName;
      const prevName = fs.existsSync(nameMarkerPath)
        ? fs.readFileSync(nameMarkerPath, 'utf8').trim()
        : '';
      if (prevName !== targetName) {
        try {
          await sock.updateProfileName(targetName);
          if (this.state.user) this.state.user.name = targetName;
          fs.writeFileSync(nameMarkerPath, targetName, 'utf8');
          logger.success('NAME', `Force-extended WhatsApp Profile Name: ${targetName}`);
        } catch (err) {
          logger.warn('NAME', `Profile name update note: ${err.message}`);
        }
      }

      const bioMarkerPath = path.join(config.sessionDir, '.bio-extended-v2');
      const desiredKey = settings.customBio || config.links.defaultBio;
      const prevKey = fs.existsSync(bioMarkerPath)
        ? fs.readFileSync(bioMarkerPath, 'utf8').trim()
        : '';
      if (prevKey !== desiredKey) {
        try {
          const applied = await this.applyBotBio(settings.customBio || '');
          fs.writeFileSync(bioMarkerPath, desiredKey, 'utf8');
          logger.success(
            'BIO',
            `Force-extended WhatsApp Bold Bio (${applied.length} chars) applied!`
          );
        } catch (err) {
          logger.warn('BIO', `Auto WhatsApp Bio update skipped: ${err.message}`);
        }
      }
    }

    if (!config.sendSessionOnConnect) return;
    const markerPath = path.join(config.sessionDir, '.connect-notified');
    if (fs.existsSync(markerPath)) return;

    try {
      const sessionStr = exportSessionId(config.sessionDir);
      const dpBuf = await getBotDpBuffer('standard');
      const welcomeCaption =
        `✅ *${config.botName} CONNECTED SUCCESSFULLY!*\n\n` +
        `├ *Owner:* ${config.ownerName}\n` +
        `├ *Platform:* ${config.platform.name}\n` +
        `├ *Mode:* ${settings.mode.toUpperCase()}\n` +
        `├ *Prefix:* ${settings.prefix}\n` +
        `└ *Help:* Send *${settings.prefix}menu*\n\n` +
        `_Below is your portable SESSION_ID for Heroku, Render, Koyeb, Railway, or Panel deployments:_`;

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
      logger.warn('NOTIFY', `Could not send initial connect DM: ${err.message}`);
    }
  }

  /**
   * Apply the built-in or custom Bot DP directly to the currently connected WhatsApp account.
   */
  async applyBotDp(customBuffer = null, { full = false } = {}) {
    if (!this.sock || this.state.status !== 'connected' || !this.state.user?.id) {
      throw new Error('Link TEXMEX-MD to WhatsApp first before applying the profile picture.');
    }
    const buf = customBuffer || (await getBotDpBuffer('standard'));
    if (!buf) throw new Error('Bot DP image buffer not found.');
    await updateWhatsAppDp(this.sock, this.state.user.id, buf, { full });
    logger.success('BOTDP', 'Updated WhatsApp profile picture to TEXMEX-MD Anime AI DP');
    return true;
  }

  /**
   * Force-extend WhatsApp Profile Name (e.g. "⚡ 𝗧𝗘𝗫𝗠𝗘𝗫 ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 ⚡").
   */
  async applyProfileName(customName = '') {
    if (!this.sock || this.state.status !== 'connected') {
      throw new Error('Link TEXMEX-MD to WhatsApp first before updating your profile name.');
    }
    const styled = customName
      ? toBoldPreservingUrls(customName)
      : config.links.extendedName;
    await this.sock.updateProfileName(styled);
    if (this.state.user) this.state.user.name = styled;
    fs.writeFileSync(path.join(config.sessionDir, '.name-extended-v2'), styled, 'utf8');
    logger.success('NAME', `Updated WhatsApp Profile Name: ${styled}`);
    return styled;
  }

  /**
   * Force-extend WhatsApp Profile Bio ("About") with cool bold fonts, extended name TEXMEX,
   * and live Website + Port links directly over the raw XMPP status IQ stanza (no 139-char client cap).
   */
  async applyBotBio(customText = '') {
    if (!this.sock || this.state.status !== 'connected') {
      throw new Error('Link TEXMEX-MD to WhatsApp first before updating your profile bio.');
    }

    const myJid = this.state.user?.id;
    const rawCustom = String(customText || '').trim();

    // Also push full uncut description + clickable websites to WhatsApp Business profile if supported
    if (typeof this.sock.updateBussinesProfile === 'function') {
      this.sock
        .updateBussinesProfile({
          description: rawCustom ? toBoldPreservingUrls(rawCustom) : config.links.defaultBio,
          websites: [
            config.links.websiteUrl,
            config.links.healthUrl,
            config.links.repoWebUrl
          ]
        })
        .catch(() => {});
    }

    if (rawCustom) {
      const boldBio = toBoldPreservingUrls(rawCustom);
      await this.sock.updateProfileStatus(boldBio);
      fs.writeFileSync(path.join(config.sessionDir, '.bio-applied'), boldBio, 'utf8');
      logger.success('BIO', `Updated custom extended bold bio (${boldBio.length} chars)`);
      return boldBio;
    }

    // Try progressive extended tiers from longest (8-line detailed bold bio) downward,
    // verifying via fetchStatus so Website & Port links are never cut off mid-URL.
    const tiers = config.links.bioTiers || [config.links.defaultBio];
    let acceptedBio = tiers[0];

    for (const candidate of tiers) {
      try {
        await this.sock.updateProfileStatus(candidate);
        acceptedBio = candidate;

        // Read back actual server-stored status if fetchStatus is available
        if (myJid && typeof this.sock.fetchStatus === 'function') {
          const res = await this.sock.fetchStatus(myJid).catch(() => null);
          const serverStored =
            res?.[0]?.status?.status ||
            res?.[0]?.status ||
            '';
          if (typeof serverStored === 'string' && serverStored.length > 0) {
            logger.info(
              'BIO',
              `Server stored ${serverStored.length}/${candidate.length} chars via raw IQ`
            );
            // Ensure the entire bio all the way to the trailing repo link was stored uncut
            if (
              serverStored.includes(config.links.websiteUrl) &&
              serverStored.includes('TEMEX-MD')
            ) {
              acceptedBio = serverStored;
              break;
            }
            continue;
          }
        }
        break;
      } catch {
        // Try next tier
      }
    }

    fs.writeFileSync(path.join(config.sessionDir, '.bio-applied'), acceptedBio, 'utf8');
    return acceptedBio;
  }

  /**
   * Request an 8-character WhatsApp Multi-Device Pairing Code for a phone number.
   */
  async requestPairing(rawPhone, useCustom = false) {
    const phone = cleanPhoneNumber(rawPhone);
    if (!phone || phone.length < 8 || phone.length > 16) {
      throw new Error('Enter a valid international phone number without + (e.g. 254712345678)');
    }

    if (this.state.status === 'connected') {
      throw new Error('TEXMEX-MD is already connected! Reset session first if you want to pair a different number.');
    }

    // If previous partial registered creds exist, reset before pairing a fresh number
    if (hasSavedSession(config.sessionDir) && this.sock?.authState?.creds?.registered) {
      clearSessionDir(config.sessionDir);
      await this.start();
    } else if (!this.sock) {
      await this.start();
    }

    // Wait briefly until socket WebSocket handshake is ready
    for (let i = 0; i < 16; i++) {
      if (this.sock?.ws?.isOpen || this.state.qrRaw) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!this.sock) {
      throw new Error('WhatsApp socket is still initializing. Please try again in 2 seconds.');
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

    logger.success('PAIRING', `Pairing code for +${phone}: ${formatted}`);
    return { phone, code: formatted };
  }

  /**
   * Import a TEXMEX-MD~ session string at runtime and reconnect immediately.
   */
  async importSession(sessionString) {
    const jsonText = decodeSessionString(sessionString);
    clearSessionDir(config.sessionDir);
    fs.writeFileSync(path.join(config.sessionDir, 'creds.json'), jsonText, 'utf8');
    logger.success('SESSION', 'Imported new TEXMEX-MD~ session credentials; reconnecting...');
    await this.restart();
    return true;
  }

  /**
   * Wipe active session and restart into fresh QR / Pairing mode.
   */
  async resetSession() {
    try {
      if (this.sock && this.state.status === 'connected') {
        await this.sock.logout().catch(() => {});
      }
    } catch {
      // ignore
    }
    clearSessionDir(config.sessionDir);
    this.state.user = null;
    this.state.pairingCode = null;
    this.state.qrDataUrl = null;
    this.autoPairTriggered = false;
    await this.restart();
  }

  async restart() {
    clearTimeout(this.reconnectTimer);
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock = null;
      }
    } catch {
      // ignore
    }
    await this.start();
  }

  async stop() {
    this.isShuttingDown = true;
    clearTimeout(this.reconnectTimer);
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock = null;
      }
    } catch {
      // ignore
    }
    this.state.status = 'stopped';
  }
}

export const botEngine = new TexmexBotEngine();
export default botEngine;
