/**
 * Structured logging service
 * Replaces scattered console.log/error with consistent, structured output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    `[${entry.module}]`,
    entry.message,
  ];
  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(JSON.stringify(entry.data));
  }
  if (entry.error) {
    parts.push(`Error: ${entry.error.message}`);
    if (entry.error.stack && process.env.NODE_ENV !== 'production') {
      parts.push(`\n${entry.error.stack}`);
    }
  }
  return parts.join(' ');
}

function log(level: LogLevel, module: string, message: string, extra?: { data?: Record<string, unknown>; error?: Error }) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
    data: extra?.data,
    error: extra?.error ? { message: extra.error.message, stack: extra.error.stack } : undefined,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Creates a scoped logger for a specific module
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log('debug', module, message, { data }),
    info: (message: string, data?: Record<string, unknown>) =>
      log('info', module, message, { data }),
    warn: (message: string, data?: Record<string, unknown>) =>
      log('warn', module, message, { data }),
    error: (message: string, error?: Error, data?: Record<string, unknown>) =>
      log('error', module, message, { error, data }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
