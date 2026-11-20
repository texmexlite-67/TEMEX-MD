import os from 'node:os';
import config from '../config.js';
import { hasFfmpeg, getSharp } from '../lib/env.js';
import { hasSavedSession } from '../lib/session.js';
import { loadPlugins } from '../lib/plugins.js';

async function runDoctor() {
  const sharp = await getSharp();
  const ffmpeg = hasFfmpeg();
  const plugins = await loadPlugins();
  const saved = hasSavedSession(config.sessionDir);

  console.log('\n======================================================');
  console.log(' 🩺 TEXMEX-MD ENVIRONMENT DOCTOR');
  console.log('======================================================');
  console.log(` • Bot Name         : ${config.botName}`);
  console.log(` • Owner            : ${config.ownerName}`);
  console.log(` • Node.js Version  : ${process.version} (Required >=20.0.0)`);
  console.log(` • Detected Host    : ${config.platform.name} [${config.platform.id}]`);
  console.log(` • Ephemeral Disk   : ${config.platform.ephemeral ? 'Yes (Use SESSION_ID env)' : 'No (Persistent)'}`);
  console.log(` • Listening Port   : ${config.port}`);
  console.log(` • Session Path     : ${config.sessionDir}`);
  console.log(` • Data Path        : ${config.dataDir}`);
  console.log(` • Saved Session    : ${saved ? '✅ Present' : config.sessionId ? '📦 Provided via SESSION_ID' : '⚪ None yet (Pair via Web/CLI)'}`);
  console.log(` • Sharp Image Lib  : ${sharp ? '✅ Installed' : '⚪ Optional fallback'}`);
  console.log(` • FFmpeg Binary    : ${ffmpeg ? '✅ Installed' : '⚪ Not found (static stickers still work via Sharp)'}`);
  console.log(` • Loaded Commands  : ${plugins.totalCommands} commands (${plugins.totalAliases} aliases)`);
  console.log(` • Host Memory      : ${(os.freemem() / 1024 / 1024).toFixed(0)} MB free / ${(os.totalmem() / 1024 / 1024).toFixed(0)} MB total`);
  console.log('======================================================\n');
}

runDoctor().catch((err) => {
  console.error('Doctor check failed:', err);
  process.exit(1);
});
