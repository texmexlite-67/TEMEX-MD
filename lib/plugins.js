import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from './logger.js';

const commandMap = new Map();
const aliasMap = new Map();

/**
 * Load (or reload) all command plugins from ./plugins/*.js
 */
export async function loadPlugins(pluginsDir = path.resolve(process.cwd(), 'plugins')) {
  commandMap.clear();
  aliasMap.clear();

  if (!fs.existsSync(pluginsDir)) {
    logger.warn('PLUGINS', `Plugins directory not found: ${pluginsDir}`);
    return getPluginSummary();
  }

  const files = fs
    .readdirSync(pluginsDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(pluginsDir, file);
    try {
      const cacheBust = `?t=${Date.now()}`;
      const mod = await import(`${pathToFileURL(fullPath).href}${cacheBust}`);
      const list = Array.isArray(mod.default) ? mod.default : mod.commands || [];

      for (const cmd of list) {
        if (!cmd?.name || typeof cmd.execute !== 'function') continue;
        const primary = cmd.name.toLowerCase();
        const normalized = {
          name: primary,
          aliases: (cmd.aliases || []).map((a) => a.toLowerCase()),
          category: (cmd.category || 'general').toLowerCase(),
          desc: cmd.desc || '',
          usage: cmd.usage || `.${primary}`,
          ownerOnly: Boolean(cmd.ownerOnly),
          groupOnly: Boolean(cmd.groupOnly),
          adminOnly: Boolean(cmd.adminOnly),
          botAdminOnly: Boolean(cmd.botAdminOnly),
          react: cmd.react || '',
          execute: cmd.execute
        };

        commandMap.set(primary, normalized);
        for (const alias of normalized.aliases) {
          aliasMap.set(alias, primary);
        }
      }
    } catch (err) {
      logger.error('PLUGINS', `Failed loading ${file}: ${err.message}`);
    }
  }

  logger.success(
    'PLUGINS',
    `Loaded ${commandMap.size} commands (${aliasMap.size} aliases) across ${files.length} plugin modules`
  );
  return getPluginSummary();
}

export function findCommand(trigger) {
  const key = String(trigger || '').toLowerCase();
  if (commandMap.has(key)) return commandMap.get(key);
  const target = aliasMap.get(key);
  return target ? commandMap.get(target) : null;
}

export function getAllCommands() {
  return Array.from(commandMap.values());
}

export function getCommandsByCategory() {
  const grouped = {};
  for (const cmd of commandMap.values()) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }
  return grouped;
}

export function getPluginSummary() {
  const grouped = getCommandsByCategory();
  const categories = Object.keys(grouped).map((cat) => ({
    category: cat,
    count: grouped[cat].length,
    commands: grouped[cat].map((c) => ({
      name: c.name,
      aliases: c.aliases,
      desc: c.desc,
      usage: c.usage,
      ownerOnly: c.ownerOnly,
      groupOnly: c.groupOnly,
      adminOnly: c.adminOnly
    }))
  }));

  return {
    totalCommands: commandMap.size,
    totalAliases: aliasMap.size,
    categories
  };
}
