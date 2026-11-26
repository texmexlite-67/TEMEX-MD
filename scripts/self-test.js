import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpmux from 'node-webpmux';

import { loadPlugins, findCommand } from '../lib/plugins.js';
import { exportSessionId, decodeSessionString } from '../lib/session.js';
import { serializeMessage } from '../lib/serialize.js';
import { imageToSticker, stickerToImage } from '../lib/sticker.js';
import { safeEvaluateMath } from '../plugins/tools.js';
import { createWebServer } from '../lib/server.js';
import { botEngine } from '../lib/bot.js';
import { getSharp } from '../lib/env.js';
import { getBotDpBuffer } from '../lib/avatar.js';
import { handleMessagesUpsert } from '../lib/handler.js';
import {
  setSelfFreeze,
  addFrozenUser,
  removeFrozenUser,
  isFrozenDm,
  getFreezeState
} from '../lib/store.js';
import config from '../config.js';

async function runSelfTests() {
  console.log('🧪 Running TEXMEX-MD automated verification suite...\n');

  // 1. Plugin Loader Test
  const summary = await loadPlugins();
  assert.ok(summary.totalCommands >= 50, `Expected >=50 commands, got ${summary.totalCommands}`);
  assert.ok(findCommand('menu'), 'menu command must exist');
  assert.ok(findCommand('sticker'), 'sticker command must exist');
  assert.ok(findCommand('antilink'), 'antilink command must exist');
  assert.ok(findCommand('vv'), 'viewonce (.vv) command must exist');
  assert.ok(findCommand('getsession'), 'getsession command must exist');
  assert.ok(findCommand('botdp'), 'botdp command must exist');
  assert.ok(findCommand('setbotdp'), 'setbotdp command must exist');
  assert.ok(findCommand('animeai'), 'animeai command must exist');
  assert.ok(findCommand('imagine'), 'imagine command must exist');
  // Verify Group Controller & Downloader commands
  for (const requiredCmd of [
    'gclink', 'tag', 'hidetag', 'chatmute', 'chatunmute', 'adminstag', 'pin', 'unpin',
    'kick', 'add', 'invitemember', 'gstatusmention', 'gprofile', 'gabout',
    'antilink', 'antilinkwarn', 'anticall', 'antispam', 'antistatusmention', 'cd',
    'ytmp4', 'ytmp3', 'instagram', 'facebook', 'tiktok', 'mediafire', 'img', 'video',
    'ai', 'chatbot', 'summarize', 'explain', 'code',
    'motivate', 'quote', 'psychology', 'pyschology', 'bible', 'spiritual', 'prayer',
    'examprayer', 'travelprayer', 'prosperityprayer', 'familyprayer', 'friendsprayer',
    'selfprayer', 'groupprayer', 'motivationalprayer', 'successprayer', 'failureprayer',
    'tts', 'voice', 'bibleaudio', 'prayeraudio', 'motivateaudio', 'pushvoice', 'setvoice', 'autovoice',
    'pushstatus', 'tostatus', 'pushbible', 'pushprayer', 'pushmotivate', 'pushpsych', 'pushquote', 'autostatuspush',
    'bio', 'web', 'ports', 'setbio', 'autobio', 'tunnel',
    'selffreeze', 'userfreeze', 'unfreeze', 'freezelist'
  ]) {
    assert.ok(findCommand(requiredCmd), `${requiredCmd} command must exist`);
  }
  const dpBuf = await getBotDpBuffer('standard');
  assert.ok(dpBuf && dpBuf.length > 1000, 'Built-in Anime AI Bot DP must exist');
  console.log(`✅ [1/6] Plugin architecture, Group Controller & Downloader Hub verified (${summary.totalCommands} commands, ${summary.totalAliases} aliases)`);

  // 2. TEXMEX-MD~ Session Codec Round-Trip Test
  const tmpSession = fs.mkdtempSync(path.join(os.tmpdir(), 'texmex-sess-test-'));
  const mockCreds = {
    noiseKey: { private: 'abc', public: 'def' },
    signedIdentityKey: { private: 'ghi', public: 'jkl' },
    registrationId: 12345
  };
  fs.writeFileSync(path.join(tmpSession, 'creds.json'), JSON.stringify(mockCreds), 'utf8');
  const exported = exportSessionId(tmpSession);
  assert.ok(exported.startsWith('TEXMEX-MD~'), 'Session string must start with TEXMEX-MD~');
  const decoded = JSON.parse(decodeSessionString(exported));
  assert.equal(decoded.registrationId, 12345);
  fs.rmSync(tmpSession, { recursive: true, force: true });
  console.log('✅ [2/6] TEXMEX-MD~ gzip+base64 Session ID encoder/decoder verified');

  // 3. Baileys v7 Serializer (LID + ViewOnceV2 Unwrapping) Test
  const mockSock = {
    user: { id: '254700000001:4@s.whatsapp.net', lid: '99887766:4@lid' },
    sendMessage: async () => ({ key: { id: 'sent1' } })
  };
  const mockRaw = {
    key: {
      remoteJid: '120363000000000@g.us',
      fromMe: false,
      id: 'MSG123',
      participant: '1122334455@lid',
      participantAlt: '254711223344@s.whatsapp.net'
    },
    pushName: 'Tester',
    message: {
      ephemeralMessage: {
        message: {
          extendedTextMessage: {
            text: '.vv',
            contextInfo: {
              stanzaId: 'QUOTED99',
              participant: '254799887766@s.whatsapp.net',
              quotedMessage: {
                viewOnceMessageV2: {
                  message: {
                    imageMessage: { caption: 'Secret photo', mimetype: 'image/jpeg' }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
  const m = serializeMessage(mockSock, mockRaw);
  assert.equal(m.isGroup, true);
  assert.equal(m.senderNumber, '254711223344');
  assert.equal(m.text, '.vv');
  assert.equal(m.quoted?.isViewOnce, true);
  assert.equal(m.quoted?.mtype, 'imageMessage');
  assert.equal(m.quoted?.text, 'Secret photo');
  console.log('✅ [3/6] Baileys v7 LID/PN + ViewOnceV2 message serializer verified');

  // 4. Sticker Engine + EXIF Pack Metadata Test
  const sharp = await getSharp();
  if (sharp) {
    const samplePng = await sharp({
      create: { width: 120, height: 120, channels: 4, background: { r: 0, g: 217, b: 126, alpha: 1 } }
    }).png().toBuffer();
    const stickerBuf = await imageToSticker(samplePng, { packname: 'TEXMEX-MD', author: 'TEXMEX-MD' });
    const webpImg = new webpmux.Image();
    await webpImg.load(stickerBuf);
    assert.ok(webpImg.exif, 'Sticker must contain EXIF metadata');
    assert.ok(webpImg.exif.toString('utf8').includes('TEXMEX-MD'), 'Sticker EXIF must embed TEXMEX-MD');
    const restoredPng = await stickerToImage(stickerBuf);
    assert.ok(restoredPng.length > 100, 'Converted PNG must be non-empty');
    console.log('✅ [4/6] Sticker WebP encoder, TEXMEX-MD EXIF stamper & PNG converter verified');
  } else {
    console.log('⚪ [4/6] Sharp not installed; skipped binary image test');
  }

  // 5. Safe Math Evaluator Test
  assert.equal(safeEvaluateMath('sqrt(144) + 2^5 - (3 * 4)'), 32);
  console.log('✅ [5/6] Safe mathematical expression evaluator verified');

  // 6. Web Pairing Hub & Health Endpoints Test
  const app = createWebServer(botEngine);
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = srv.address().port;

  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.bot, 'TEXMEX-MD');
    assert.equal(health.owner, 'TEXMEX-MD');
    assert.equal(health.developer, 'Developed by TEXMEX with ❤️ · https://temex-md.onrender.com/');
    assert.equal(health.links.websiteUrl, 'https://temex-md.onrender.com/');
    assert.equal(health.repository, 'https://github.com/texmexlite-67/TEMEX-MD.git');

    const statusRes = await fetch(`http://127.0.0.1:${port}/api/status`);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.state.botName, 'TEXMEX-MD');

    const phonkRes = await fetch(`http://127.0.0.1:${port}/api/phonk/presets`);
    const phonkJson = await phonkRes.json();
    assert.equal(phonkJson.ok, true);
    assert.ok(phonkJson.minDurationSec >= 160, 'Minimum studio song duration must be >= 160s');
    const genreIds = phonkJson.genres.map((g) => g.id);
    for (const g of ['brazilian_funk', 'drift_phonk', 'phonk', 'favela', 'trap', 'jumpstyle']) {
      assert.ok(genreIds.includes(g), `Missing studio genre preset: ${g}`);
    }
    const moodIds = phonkJson.moods.map((m) => m.id);
    assert.ok(moodIds.includes('hypnotic'), 'Studio moods must include hypnotic');
    const typeIds = phonkJson.types.map((t) => t.id);
    assert.ok(typeIds.includes('crushed'), 'Studio types must include crushed');
    assert.ok(typeIds.includes('no_batidao_cd'), 'Studio types must include no_batidao_cd');
    const effectIds = phonkJson.effects.map((e) => e.id);
    assert.ok(effectIds.includes('slowed'), 'Studio effects must include slowed');

    const pushCatRes = await fetch(`http://127.0.0.1:${port}/api/push/catalog`);
    const pushCatJson = await pushCatRes.json();
    assert.equal(pushCatJson.ok, true);
    assert.ok(pushCatJson.categories.length >= 6, 'Push catalog must expose >= 6 categories');
    assert.ok(pushCatJson.subcategories.length >= 24, 'Push catalog must expose >= 24 tickable subcategories');

    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    const html = await htmlRes.text();
    assert.ok(html.includes('TEXMEX-MD'), 'Dashboard HTML must render TEXMEX-MD UI');
    assert.ok(html.includes('NEXUS COMM'), 'Dashboard HTML must render NEXUS COMM UI');
    assert.ok(html.includes('sec-servers'), 'Dashboard HTML must render Multi-Server Cluster Grid');
    assert.ok(html.includes('sec-tickpush'), 'Dashboard HTML must render Tick-Box Push Center');
    assert.ok(html.includes('bh-phonk'), 'Dashboard HTML must render AI Phonk Studio UI');
    assert.ok(html.includes('phonkTypeSelect'), 'Studio HTML must include Production Type selector');
    assert.ok(html.includes('phonkEffectSelect'), 'Studio HTML must include Master Effects selector');
    assert.ok(html.includes('phonkDurationSelect'), 'Studio HTML must include 160s+ Duration selector');
    assert.ok(html.includes('phonkVocalModeSelect'), 'Studio HTML must include Smart Vocal Alignment / No Batidao selector');
    assert.ok(html.includes('toggleSelfFreezeBtn'), 'Web Vault must include Single-Grey-Tick Self Freeze toggle');
    console.log('✅ [6/7] NEXUS COMM Multi-Server Pairing Hub, Tick-Box Push Catalog & 160s+ AI Phonk Studio verified');
  } finally {
    srv.close();
  }

  // 7. 0.01s Turbo .ping & Single-Grey-Tick <self freeze> / <user freeze> DM Engine Verification
  {
    const testSlot = 'srv-test-freeze';
    setSelfFreeze(testSlot, false);
    removeFrozenUser(testSlot, 'all');

    const sentPayloads = [];
    const readFlushed = [];
    const evBus = new EventEmitter();
    const wsBus = new EventEmitter();
    let onlineReceiptFlag = true;
    evBus.on('connection.update', ({ isOnline }) => {
      if (typeof isOnline === 'boolean') onlineReceiptFlag = isOnline;
    });

    const mockSock = {
      slotId: testSlot,
      user: { id: '254715442684:1@s.whatsapp.net', lid: '998877@lid', name: 'TEXMEX' },
      ev: evBus,
      ws: wsBus,
      sendMessage: async (jid, content) => {
        sentPayloads.push({ jid, content });
        return { key: { remoteJid: jid, id: 'OUT_1', fromMe: true } };
      },
      sendPresenceUpdate: async () => {},
      readMessages: async (keys) => {
        readFlushed.push(...keys);
      }
    };

    const mockEngine = Object.create(botEngine);
    mockEngine.slotId = testSlot;
    mockEngine.sock = mockSock;
    mockEngine.state = { status: 'connected', user: { number: '254715442684', id: '254715442684@s.whatsapp.net' } };
    mockEngine.attachFreezeInterceptor(mockSock);

    // 7a. Verify .ping executes in a SINGLE sendMessage call and outputs 0.01s
    const pingCmd = findCommand('ping');
    assert.equal(pingCmd.fast, true, '.ping must have fast: true');
    await handleMessagesUpsert(
      mockSock,
      {
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '254715442684@s.whatsapp.net', fromMe: true, id: 'PING_MSG_1' },
            message: { conversation: '.ping' }
          }
        ]
      },
      mockEngine
    );
    const textPayloads = sentPayloads.filter((p) => p.content?.text);
    const pongMsgs = textPayloads.filter((p) => p.content?.text?.includes('0.01s'));
    assert.equal(textPayloads.length, 1, '.ping must dispatch in a single text sendMessage call (no edit round-trip)');
    assert.equal(pongMsgs.length, 1, `.ping output must report 0.01s speed, got: ${textPayloads[0]?.content?.text}`);

    // 7b. Spaced `.self freeze on` activates DM-only freeze (NEVER groups!)
    await handleMessagesUpsert(
      mockSock,
      {
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '254715442684@s.whatsapp.net', fromMe: true, id: 'SF_ON_1' },
            message: { conversation: '.self freeze on' }
          }
        ]
      },
      mockEngine
    );
    assert.equal(getFreezeState(testSlot).selfFreeze, true, '.self freeze on must enable selfFreeze');
    assert.equal(
      isFrozenDm(testSlot, { chatJid: '254700112233@s.whatsapp.net', isGroup: false, botNumber: '254715442684' }).frozen,
      true,
      'Incoming DM must be frozen under self freeze'
    );
    assert.equal(
      isFrozenDm(testSlot, { chatJid: '1203630499999@g.us', isGroup: true, botNumber: '254715442684' }).frozen,
      false,
      'WhatsApp Groups (@g.us) must NEVER be frozen under self freeze'
    );

    // Stanza check: DM frame sets isOnline=false (type="inactive" single grey tick ✓), Group frame sets isOnline=true
    wsBus.emit('CB:message', { attrs: { from: '254700112233@s.whatsapp.net', id: 'DM_FRAME_1' } });
    assert.equal(onlineReceiptFlag, false, 'Frozen DM stanza must switch Baileys to inactive single-grey-tick receipt');
    wsBus.emit('CB:message', { attrs: { from: '1203630499999@g.us', participant: '254700112233@s.whatsapp.net', id: 'GRP_FRAME_1' } });
    assert.equal(onlineReceiptFlag, true, 'Group stanza must preserve active receipt handling');

    // Queue an incoming frozen DM, then simulate owner clicking/opening the DM (chats.update unreadCount: 0) -> 2 blue ticks!
    await handleMessagesUpsert(
      mockSock,
      {
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '254700112233@s.whatsapp.net', fromMe: false, id: 'FROZEN_IN_1' },
            message: { conversation: 'Hey are you online?' }
          }
        ]
      },
      mockEngine
    );
    assert.equal(readFlushed.length, 0, 'Frozen DM must NOT auto-read before owner clicks the DM');
    evBus.emit('chats.update', [{ id: '254700112233@s.whatsapp.net', unreadCount: 0 }]);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(readFlushed.length, 1, 'Clicking/opening the DM must immediately flush read receipt (2 blue ticks ✓✓)');
    assert.equal(readFlushed[0].id, 'FROZEN_IN_1');

    // 7c. Turn `.self freeze off` and test `.user freeze 254799887766` (specific person + LID mapping!)
    setSelfFreeze(testSlot, false);
    await handleMessagesUpsert(
      mockSock,
      {
        type: 'notify',
        messages: [
          {
            key: { remoteJid: '254715442684@s.whatsapp.net', fromMe: true, id: 'UF_ON_1' },
            message: { conversation: '.user freeze 254799887766' }
          }
        ]
      },
      mockEngine
    );
    assert.equal(getFreezeState(testSlot).frozenUsers.length, 1, '.user freeze must register target user');
    // Frozen user over PN AND over Baileys v7 @lid envelope must freeze; non-frozen user must NOT freeze!
    wsBus.emit('CB:message', { attrs: { from: '55443322@lid', sender_pn: '254799887766@s.whatsapp.net', id: 'LID_FRAME_1' } });
    assert.equal(onlineReceiptFlag, false, 'LID-addressed DM from frozen user must stay on single grey tick (✓)');
    wsBus.emit('CB:message', { attrs: { from: '254711111111@s.whatsapp.net', id: 'OTHER_DM_1' } });
    assert.equal(onlineReceiptFlag, true, 'Non-frozen user DM must receive normal two grey ticks (✓✓)');

    // Clean up test slot state
    setSelfFreeze(testSlot, false);
    removeFrozenUser(testSlot, 'all');
    console.log('✅ [7/7] 0.01s Turbo .ping & Single-Grey-Tick <self freeze> / <user freeze> DM Engine verified');
  }

  console.log('\n🎉 ALL TEXMEX-MD VERIFICATION CHECKS PASSED!\n');
}

runSelfTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
