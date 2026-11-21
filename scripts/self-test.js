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
    'bio', 'web', 'ports', 'setbio', 'autobio', 'tunnel'
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

    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    const html = await htmlRes.text();
    assert.ok(html.includes('TEXMEX-MD'), 'Dashboard HTML must render TEXMEX-MD UI');
    assert.ok(html.includes('bh-phonk'), 'Dashboard HTML must render AI Phonk Studio UI');
    assert.ok(html.includes('phonkTypeSelect'), 'Studio HTML must include Production Type selector');
    assert.ok(html.includes('phonkEffectSelect'), 'Studio HTML must include Master Effects selector');
    assert.ok(html.includes('phonkDurationSelect'), 'Studio HTML must include 160s+ Duration selector');
    assert.ok(html.includes('phonkVocalModeSelect'), 'Studio HTML must include Smart Vocal Alignment / No Batidao selector');
    console.log('✅ [6/6] Express Web Pairing Hub, 160s+ AI Phonk & No Batidão Studio & /health endpoints verified');
  } finally {
    srv.close();
  }

  console.log('\n🎉 ALL TEXMEX-MD VERIFICATION CHECKS PASSED!\n');
}

runSelfTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
