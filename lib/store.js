import fs from 'node:fs';
import path from 'node:path';
import NodeCache from 'node-cache';
import config from '../config.js';
import { cleanPhoneNumber } from './env.js';
import { logger } from './logger.js';

const dbPath = path.join(config.dataDir, 'texmex-db.json');

const defaultDb = () => ({
  settings: {
    prefix: config.prefix,
    multiPrefix: config.multiPrefix,
    mode: config.mode,
    autoRead: config.autoRead,
    autoStatusView: config.autoStatusView,
    autoStatusReact: config.autoStatusReact,
    statusReactEmoji: config.statusReactEmoji,
    autoTyping: config.autoTyping,
    autoRecording: config.autoRecording,
    antiDelete: config.antiDelete, // 'off' | 'chat' | 'dm'
    antiCall: config.antiCall, // 'off' | 'reject' | 'block'
    menuImage: config.menuImage,
    autoSetBotDp: config.autoSetBotDp,
    cooldownSeconds: Number.parseInt(process.env.COOLDOWN_SECONDS || '0', 10) || 0,
    chatbotMode: (process.env.CHATBOT_MODE || 'off').toLowerCase(), // 'off' | 'dm' | 'group' | 'all'
    autoVoice: true,
    ttsVoice: (process.env.TTS_VOICE || 'andrew').toLowerCase(),
    autoSetBio: config.autoSetBio,
    customBio: '',
    autoStatusPush: {
      enabled: false,
      intervalMinutes: 180,
      category: 'mix', // 'mix' | 'motivation' | 'quote' | 'psychology' | 'bible' | 'prayer'
      subcategories: ['bible_promise', 'morning_prayer', 'morning_discipline', 'cognitive_bias']
    }
  },
  slotConfigs: {},
  slotContacts: {},
  sudo: [...new Set([config.ownerNumber, ...config.sudoNumbers].filter(Boolean))],
  contacts: [],
  groups: {},
  stats: {
    commandsExecuted: 0,
    messagesProcessed: 0,
    startedAt: Date.now()
  }
});

let state = defaultDb();
let saveTimer = null;

export function loadDatabase() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const base = defaultDb();
      state = {
        settings: {
          ...base.settings,
          ...(raw.settings || {}),
          autoStatusPush: {
            ...base.settings.autoStatusPush,
            ...(raw.settings?.autoStatusPush || {})
          }
        },
        sudo: [...new Set([...base.sudo, ...(Array.isArray(raw.sudo) ? raw.sudo : [])].filter(Boolean))],
        slotConfigs: raw.slotConfigs && typeof raw.slotConfigs === 'object' ? raw.slotConfigs : {},
        slotContacts: raw.slotContacts && typeof raw.slotContacts === 'object' ? raw.slotContacts : {},
        contacts: Array.isArray(raw.contacts) ? raw.contacts.slice(-2500) : [],
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        stats: {
          ...base.stats,
          commandsExecuted: Number(raw.stats?.commandsExecuted || 0),
          messagesProcessed: Number(raw.stats?.messagesProcessed || 0)
        }
      };
    } else {
      saveDatabaseSync();
    }
  } catch (err) {
    logger.warn('STORE', `Database initialized with defaults (${err.message})`);
    state = defaultDb();
  }
  return state;
}

export function saveDatabaseSync() {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const tmp = `${dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, dbPath);
  } catch (err) {
    logger.warn('STORE', `Could not persist database: ${err.message}`);
  }
}

export function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDatabaseSync();
  }, 1200);
  if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

export function getSettings() {
  return state.settings;
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  scheduleSave();
  return state.settings;
}

export function getSudoList() {
  return state.sudo;
}

export function addSudo(num) {
  const clean = cleanPhoneNumber(num);
  if (!clean) return false;
  if (!state.sudo.includes(clean)) {
    state.sudo.push(clean);
    scheduleSave();
  }
  return true;
}

export function removeSudo(num) {
  const clean = cleanPhoneNumber(num);
  const before = state.sudo.length;
  state.sudo = state.sudo.filter((n) => n !== clean);
  if (state.sudo.length !== before) scheduleSave();
  return state.sudo.length !== before;
}

export function getGroupConfig(jid) {
  if (!state.groups[jid]) {
    state.groups[jid] = {
      antilink: 'off', // 'off' | 'delete' | 'warn' | 'kick'
      antispam: 'off', // 'off' | 'warn' | 'kick'
      antistatusmention: 'off', // 'off' | 'delete' | 'warn' | 'kick'
      antibadword: false,
      badwords: ['spamlink'],
      welcome: false,
      goodbye: false,
      welcomeText: '👋 Welcome @user to *@group*!\nMembers: *@count*\n_⚡ Developed by TEXMEX with ❤️ · 🌐 https://temex-md.onrender.com/_',
      goodbyeText: '👋 Goodbye @user from *@group*. We wish you the best!\n_🌐 https://temex-md.onrender.com/_',
      warnings: {}
    };
  } else {
    if (!state.groups[jid].antispam) state.groups[jid].antispam = 'off';
    if (!state.groups[jid].antistatusmention) state.groups[jid].antistatusmention = 'off';
  }
  return state.groups[jid];
}

export function updateGroupConfig(jid, patch) {
  const current = getGroupConfig(jid);
  Object.assign(current, patch);
  scheduleSave();
  return current;
}

export function addWarning(groupJid, userNum) {
  const grp = getGroupConfig(groupJid);
  const key = cleanPhoneNumber(userNum) || userNum;
  grp.warnings[key] = (grp.warnings[key] || 0) + 1;
  scheduleSave();
  return grp.warnings[key];
}

export function resetWarnings(groupJid, userNum) {
  const grp = getGroupConfig(groupJid);
  const key = cleanPhoneNumber(userNum) || userNum;
  delete grp.warnings[key];
  scheduleSave();
}

export function getWarnings(groupJid, userNum) {
  const grp = getGroupConfig(groupJid);
  const key = cleanPhoneNumber(userNum) || userNum;
  return grp.warnings[key] || 0;
}

export function incrementStat(field) {
  if (typeof state.stats[field] === 'number') {
    state.stats[field] += 1;
    scheduleSave();
  }
}

export function getStats() {
  return state.stats;
}

// Bounded caches (low-memory safe on 512MB Heroku/Render/Pterodactyl instances)
export const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 500, useClones: false });
export const msgRetryCounterCache = new NodeCache({ stdTTL: 600, checkperiod: 120, maxKeys: 2000 });
export const messageStore = new NodeCache({ stdTTL: 1800, checkperiod: 120, maxKeys: 1500, useClones: false });

export function cacheIncomingMessage(rawMsg) {
  if (!rawMsg?.key?.id || !rawMsg.message) return;
  const compositeKey = `${rawMsg.key.remoteJid || ''}:${rawMsg.key.id}`;
  messageStore.set(compositeKey, rawMsg);
  messageStore.set(rawMsg.key.id, rawMsg);
}

export function getCachedMessage(remoteJid, id) {
  if (!id) return undefined;
  return messageStore.get(`${remoteJid || ''}:${id}`) || messageStore.get(id);
}

export function getSlotConfig(slotId = 'srv-1') {
  if (!state.slotConfigs) state.slotConfigs = {};
  if (!state.slotConfigs[slotId]) {
    const idx = Number(String(slotId).replace(/[^0-9]/g, '')) || 1;
    state.slotConfigs[slotId] = {
      slotId,
      label: idx === 1 ? 'SRV-01 // PRIMARY CORE' : `SRV-${String(idx).padStart(2, '0')} // CLIENT NODE`,
      botName: idx === 1 ? config.botName : `TEXMEX-NODE-${String(idx).padStart(2, '0')}`,
      prefix: state.settings.prefix || '.',
      mode: state.settings.mode || 'public',
      tickedSubcategories: ['bible_promise', 'morning_prayer', 'morning_discipline', 'cognitive_bias'],
      autoPushEnabled: false,
      autoPushIntervalMins: 120,
      toStatus: true,
      toSelf: false,
      voice: 'andrew',
      updatedAt: null
    };
  }
  return state.slotConfigs[slotId];
}

export function updateSlotConfig(slotId, patch = {}) {
  const cur = getSlotConfig(slotId);
  Object.assign(cur, patch, { updatedAt: new Date().toISOString() });
  if (slotId === 'srv-1') {
    if (patch.prefix) state.settings.prefix = patch.prefix;
    if (patch.mode) state.settings.mode = patch.mode;
  }
  scheduleSave();
  return cur;
}

export function getSavedSlotIds() {
  return Object.keys(state.slotConfigs || {});
}

/**
 * Record known @s.whatsapp.net contact JIDs so Status Push reaches active contacts.
 */
export function registerContactJid(jid, slotId = 'srv-1') {
  if (!jid || typeof jid !== 'string') return;
  const cleanUser = jid.split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '');
  if (!cleanUser || cleanUser.length < 7 || cleanUser.length > 16) return;
  const norm = `${cleanUser}@s.whatsapp.net`;

  if (slotId && slotId !== 'srv-1') {
    if (!state.slotContacts) state.slotContacts = {};
    if (!Array.isArray(state.slotContacts[slotId])) state.slotContacts[slotId] = [];
    if (!state.slotContacts[slotId].includes(norm)) {
      state.slotContacts[slotId].push(norm);
      if (state.slotContacts[slotId].length > 1500) {
        state.slotContacts[slotId] = state.slotContacts[slotId].slice(-1500);
      }
      scheduleSave();
    }
    return;
  }

  if (!state.contacts.includes(norm)) {
    state.contacts.push(norm);
    if (state.contacts.length > 2500) {
      state.contacts = state.contacts.slice(-2500);
    }
    scheduleSave();
  }
}

export function getStatusAudienceJids(botJid = '', slotId = 'srv-1') {
  const cleanBot = botJid ? botJid.split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '') : '';

  // Isolate client server Status audiences from Primary Server contacts!
  if (slotId && slotId !== 'srv-1') {
    const slotSet = new Set((state.slotContacts && state.slotContacts[slotId]) || []);
    if (cleanBot) slotSet.add(`${cleanBot}@s.whatsapp.net`);
    return Array.from(slotSet);
  }

  const set = new Set(state.contacts || []);
  for (const num of state.sudo || []) {
    if (num) set.add(`${num}@s.whatsapp.net`);
  }
  if (config.ownerNumber) {
    set.add(`${config.ownerNumber}@s.whatsapp.net`);
  }
  // Also harvest cached group participant phone-number JIDs
  for (const key of groupCache.keys()) {
    const meta = groupCache.get(key);
    for (const p of meta?.participants || []) {
      const candidate = p.phoneNumber || p.id;
      if (candidate?.endsWith('@s.whatsapp.net')) {
        const clean = candidate.split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '');
        if (clean) set.add(`${clean}@s.whatsapp.net`);
      }
    }
  }
  if (cleanBot) {
    set.add(`${cleanBot}@s.whatsapp.net`);
  }
  return Array.from(set);
}

loadDatabase();
