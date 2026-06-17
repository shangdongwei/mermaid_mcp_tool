import winston from 'winston';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LogEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.resolve(__dirname, '../.mermaid_logs');

const logEntries: LogEntry[] = [];
const MAX_LOG_ENTRIES = 10000;

const fileTransport = new winston.transports.File({
  filename: path.join(LOG_DIR, 'mermaid-fix.log'),
  maxsize: 5 * 1024 * 1024,
  maxFiles: 5,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  )
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}] ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta) : ''}`;
    })
  )
});

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  },
  transports: [fileTransport, consoleTransport]
});

async function initLogDir(): Promise<void> {
  const fs = await import('fs/promises');
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

initLogDir();

function addLogEntry(entry: LogEntry): void {
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }
}

export const logger = {
  info: (category: LogEntry['category'], message: string, metadata?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'info',
      category,
      message,
      metadata
    };
    addLogEntry(entry);
    winstonLogger.info(message, { category, ...metadata });
  },

  warn: (category: LogEntry['category'], message: string, metadata?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'warn',
      category,
      message,
      metadata
    };
    addLogEntry(entry);
    winstonLogger.warn(message, { category, ...metadata });
  },

  error: (category: LogEntry['category'], message: string, metadata?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'error',
      category,
      message,
      metadata
    };
    addLogEntry(entry);
    winstonLogger.error(message, { category, ...metadata });
  },

  debug: (category: LogEntry['category'], message: string, metadata?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'debug',
      category,
      message,
      metadata
    };
    addLogEntry(entry);
    winstonLogger.debug(message, { category, ...metadata });
  },

  getLogs: (requestId?: string): LogEntry[] => {
    if (!requestId) return [...logEntries];
    return logEntries.filter(entry => entry.requestId === requestId);
  }
};
