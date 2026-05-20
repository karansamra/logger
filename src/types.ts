/**
 * Public types for logger.
 * Import these in consuming services for full type safety.
 */

export interface LogContext {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  env: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, error?: Error, context?: LogContext) => void;
  fatal: (message: string, error?: Error, context?: LogContext) => void;
}

export type LogTransport = 'console' | 'file' | 'both' | 'console,file';

export interface LoggerConfig {
  /** Pino log level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' */
  level: string;
  /** Where to emit logs. 'both' and 'console,file' are equivalent. */
  transport: LogTransport;
  /** Service / app name — used in log payloads and log file names. */
  service: string;
  /** Environment label (e.g. 'development', 'production'). */
  environment: string;
  /** Number of days to retain daily log files. */
  rotationDays: number;
  /** When true, sensitive field paths are censored to [REDACTED]. */
  enableRedaction: boolean;
  /** Directory to write log files. Defaults to './logs'. */
  logsDir?: string;
}

/**
 * Optional callback registered via `setErrorReporter`.
 * Called on every `error` and `fatal` log so you can forward to Sentry
 * (or any other error-tracking service) without coupling this package to it.
 */
export type ErrorReporter = (
  level: 'error' | 'fatal',
  message: string,
  context?: LogContext & {
    errorName?: string;
    errorCode?: string | number;
  }
) => void;
