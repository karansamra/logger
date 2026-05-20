/**
 * Pino logger factory with:
 *  - Daily rotating file output via `file-stream-rotator`
 *  - Human-friendly colored console output
 *  - Sensitive-field redaction (passwords, tokens, JWTs, etc.)
 *  - Multistream (console + file can run simultaneously)
 */

import { getStream } from 'file-stream-rotator';
import pino from 'pino';
import type { LoggerConfig } from './types.js';

const MILLISECONDS_PER_DAY = 86_400_000;

interface FormattedLogStream {
  write(data: string): void;
}

const createFileStream = (
  service: string,
  maxLogDays: number,
  logsDir: string
): FormattedLogStream => {
  const rotator = getStream({
    filename: `${logsDir}/${service}-%DATE%`,
    frequency: 'daily',
    date_format: 'YYYY-MM-DD',
    extension: '.log',
    max_logs: `${Math.max(maxLogDays, 1)}d`,
    audit_file: `${logsDir}/.${service}-audit.json`,
    file_options: { flags: 'a' },
    end_stream: true,
  });

  rotator.once('open', () => {
    rotator.write(
      `\n=== LOG SESSION STARTED: ${new Date().toISOString()} ===\n\n`
    );
  });

  return {
    write: (data: string) => {
      try {
        const log = JSON.parse(data) as Record<string, unknown>;
        const timestamp = log['timestamp'] ?? log['time'];
        const level = String(log['level'] ?? '').toUpperCase();
        const message = log['message'] ?? log['msg'];
        const context = log['context'];
        const error = log['error'];

        rotator.write(`\n[${String(timestamp)}] [${level}] ${String(message)}\n`);

        if (context && typeof context === 'object' && Object.keys(context).length > 0) {
          rotator.write(`CONTEXT: ${JSON.stringify(context, null, 2)}\n`);
        }
        if (error) {
          rotator.write(`ERROR: ${JSON.stringify(error, null, 2)}\n`);
        }
        rotator.write(`---\n`);
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : String(parseError);
        rotator.write(`\n[RAW LOG] ${data}\n[PARSE ERROR] ${msg}\n---\n`);
      }
    },
  };
};

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  FATAL: '\x1b[41;37m',
};
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const createConsoleStream = (): FormattedLogStream => ({
  write: (data: string) => {
    try {
      const log = JSON.parse(data) as Record<string, unknown>;
      const level = String(log['level'] ?? '').toUpperCase();
      const message = log['message'] ?? log['msg'];
      const context = log['context'];
      const error = log['error'];
      const color = LEVEL_COLORS[level] ?? '';
      const tag = `${color}${BOLD}[${level}]${RESET}`;
      const ts = `${DIM}${String(log['timestamp'] ?? log['time'])}:${RESET}`;
      const msg = `${BOLD}${String(message)}${RESET}`;

      const meta: Record<string, unknown> = {};
      if (log['service']) meta['service'] = log['service'];
      if (log['env']) meta['env'] = log['env'];
      if (context && typeof context === 'object' && Object.keys(context as object).length > 0) {
        meta['context'] = context;
      }
      if (error) meta['error'] = error;

      const metaStr =
        Object.keys(meta).length > 0
          ? `  ${DIM}↳ ${JSON.stringify(meta)}${RESET}`
          : '';

      console.log(`${tag} ${ts} ${msg}${metaStr}`);
    } catch {
      console.log(`[RAW LOG] ${data}`);
    }
  },
});

/** Sensitive paths that will be censored to '[REDACTED]' in all log output. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
  'user.password',
  'user.token',
  'user.apiKey',
  'user.email',
  'user.phone',
  'user.phoneNumber',
  'data.password',
  'data.token',
  'data.apiKey',
  'data.api_key',
  'data.secret',
  'data.email',
  'data.phone',
  'data.phoneNumber',
  'data.cvv',
  'data.card',
  'data.cardNumber',
  'data.card_number',
  'data.bank',
  'data.account',
  'context.password',
  'context.token',
  'context.apiKey',
  'context.email',
  'context.phone',
  'context.phoneNumber',
  'req.body.password',
  'req.body.token',
  'req.body.apiKey',
  'req.body.cvv',
  'req.body.card',
  'req.body.cardNumber',
  'req.query.token',
  'req.query.apiKey',
  'req.params.token',
  'email',
  'password',
  'token',
  'jwt',
  'session_jwt',
  'apiKey',
  'credentialId',
  'credential_id',
  'context.methodId',
  'context.method_id',
  'context.otp',
  'context.code',
  'context.credentialId',
  'context.credential_id',
  '*.email',
  '*.password',
  '*.token',
  '*.jwt',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.cvv',
  '*.cardNumber',
  '*.card_number',
  '*.authorization',
  '*.sessionJwt',
  '*.session_jwt',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.privateKey',
  '*.private_key',
  '*.secretKey',
  '*.secret_key',
  '*.methodId',
  '*.method_id',
  '*.credentialId',
  '*.credential_id',
];

export const createLogger = (config: LoggerConfig): pino.Logger => {
  const logsDir = config.logsDir ?? './logs';
  const streams: pino.StreamEntry[] = [];

  const transports = new Set(config.transport.split(',').map((t) => t.trim()));
  const hasConsole = transports.has('console');
  const hasFile = transports.has('file');
  const hasBoth = config.transport === 'both';

  if (hasConsole || hasBoth) {
    streams.push({ level: config.level as pino.Level, stream: createConsoleStream() });
  }

  if (hasFile || hasBoth) {
    streams.push({
      level: config.level as pino.Level,
      stream: createFileStream(config.service, config.rotationDays, logsDir),
    });
  }

  const loggerOptions: pino.LoggerOptions = {
    level: config.level,
    base: {
      service: config.service,
      env: config.environment,
      version: process.env['npm_package_version'] ?? '0.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (config.enableRedaction) {
    loggerOptions.redact = {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    };
  }

  return pino(loggerOptions, pino.multistream(streams));
};

/**
 * Prune log files older than `keepDays` that were not caught by the rotator
 * (e.g. files written by older versions of the logger).
 *
 * Fire-and-forget — never throws; never blocks startup.
 */
export const pruneOldLogs = async (
  service: string,
  keepDays: number,
  logsDir = './logs'
): Promise<void> => {
  if (!keepDays || keepDays <= 0) return;

  try {
    const { promises: fsp } = await import('node:fs');
    const path = await import('node:path');

    const entries = await fsp.readdir(logsDir).catch(() => null);
    if (!entries) return;

    const cutoff = Date.now() - keepDays * MILLISECONDS_PER_DAY;
    const prefix = `${service}-`;
    const ext = '.log';

    await Promise.all(
      entries.map(async (file) => {
        if (!file.startsWith(prefix) || !file.endsWith(ext)) return;
        const datePart = file.slice(prefix.length, file.length - ext.length);
        const ts = Date.parse(`${datePart}T00:00:00Z`);
        if (!Number.isFinite(ts) || ts >= cutoff) return;
        await fsp.unlink(path.join(logsDir, file)).catch(() => undefined);
      })
    );
  } catch {
    // Best-effort; never fail startup on log pruning.
  }
};
