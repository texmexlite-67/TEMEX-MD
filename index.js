import config from './config.js';
import { logger } from './lib/logger.js';
import { loadPlugins } from './lib/plugins.js';
import { botEngine } from './lib/bot.js';
import { createWebServer, startKeepAliveLoop } from './lib/server.js';
import { startPublicTunnel, stopPublicTunnel } from './lib/tunnel.js';
import { saveDatabaseSync } from './lib/store.js';

async function bootstrap() {
  console.log(
    `\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
    `┃  ⚡  ⟁ 𝗧𝗘𝗫𝗠𝗘𝗫-𝗠𝗗 // 𝗖𝗬𝗕𝗘𝗥-𝗠𝗗 𝗡𝗘𝗫𝗨𝗦 ⟁ (v${config.version})        ┃\n` +
    `┃  👑  Owner : ${config.ownerName.padEnd(42, ' ')}┃\n` +
    `┃  🐙  Repo  : github.com/texmexlite-67/TEMEX-MD.git     ┃\n` +
    `┃  ☁️  Host  : ${config.platform.name.padEnd(42, ' ')}┃\n` +
    `┃  ❤️  Credit: Developed by TEXMEX with ❤️               ┃\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`
  );

  // 1. Load modular command plugins
  await loadPlugins();

  // 2. Bind HTTP Dashboard & Cloud Health Server FIRST (prevents Heroku R10 / Render / Koyeb port timeouts)
  const app = createWebServer(botEngine);
  const httpServer = await new Promise((resolve, reject) => {
    const srv = app.listen(config.port, config.host, () => resolve(srv));
    srv.on('error', reject);
  });

  logger.success(
    'SERVER',
    `Web Pairing Hub & Health Server listening on http://${config.host}:${config.port}`
  );

  // 2b. Launch Official Cloudflare Public HTTPS Tunnel (so all phones & external devices can open the Web App without tokens or IP workarounds)
  startPublicTunnel(botEngine).catch((err) => {
    logger.warn('TUNNEL', `Public tunnel startup skipped: ${err.message}`);
  });

  // 3. Start optional cloud keep-alive self-pinger (Render / Koyeb free-tier anti-sleep)
  const keepAliveTimer = startKeepAliveLoop();

  // 4. Start Baileys Multi-Device WhatsApp Engine asynchronously
  botEngine.start().catch((err) => {
    logger.error('BOOT', `WhatsApp engine init error: ${err.message}`);
  });

  // 5. Graceful shutdown hooks across Docker, PM2, Heroku, Render, and Linux signals
  const shutdown = async (signal) => {
    logger.info('SYSTEM', `Received ${signal} — saving state and closing cleanly...`);
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    stopPublicTunnel();
    saveDatabaseSync();
    await botEngine.stop();
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Guard against transient unhandled promise rejections so 24/7 bots stay online
process.on('unhandledRejection', (reason) => {
  logger.warn('PROCESS', `Unhandled rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error('PROCESS', `Uncaught exception: ${err.message}`);
});

bootstrap().catch((err) => {
  logger.error('FATAL', err.message);
  process.exit(1);
});
