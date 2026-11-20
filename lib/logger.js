import pino from 'pino';

const MAX_LOG_BUFFER = 250;
const logBuffer = [];
const listeners = new Set();

function pushEntry(level, tag, message) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    message: typeof message === 'string' ? message : JSON.stringify(message)
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift();
  }
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      // ignore listener error
    }
  }
}

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

function formatConsole(color, levelLabel, tag, msg) {
  const time = new Date().toTimeString().slice(0, 8);
  return `${COLORS.dim}[${time}]${COLORS.reset} ${color}[TEXMEX-MD:${levelLabel}]${COLORS.reset} ${COLORS.magenta}(${tag})${COLORS.reset} ${msg}`;
}

export const logger = {
  info(tag, msg) {
    pushEntry('INFO', tag, msg);
    console.log(formatConsole(COLORS.cyan, 'INFO', tag, msg));
  },
  success(tag, msg) {
    pushEntry('OK', tag, msg);
    console.log(formatConsole(COLORS.green, 'OK', tag, msg));
  },
  warn(tag, msg) {
    pushEntry('WARN', tag, msg);
    console.warn(formatConsole(COLORS.yellow, 'WARN', tag, msg));
  },
  error(tag, msg) {
    pushEntry('ERROR', tag, msg);
    console.error(formatConsole(COLORS.red, 'ERR', tag, msg));
  },
  getRecentLogs(limit = 100) {
    return logBuffer.slice(-limit);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};

// Quiet Pino logger passed into Baileys to prevent noisy raw protocol dumps
export const baileysLogger = pino({
  level: process.env.BAILEYS_LOG_LEVEL || 'silent'
});
