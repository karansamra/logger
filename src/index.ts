/**
 * logger — core entry point
 *
 * Provides a pre-configured `logger` singleton (driven by env vars) and
 * lower-level exports for building custom logger instances.
 *
 * Usage:
 *   import { logger } from 'logger';
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('Something broke', error, { userId: '123' });
 *
 * Optional Sentry / error-tracker integration:
 *   import { setErrorReporter } from 'logger';
 *   setErrorReporter((level, message, ctx) => Sentry.captureMessage(message, { level, extra: ctx }));
 */

import { getLoggingConfig } from './config.js';
import { getRequestContext } from './context.js';
import { createLogger, pruneOldLogs } from './logger.js';
import type { ErrorReporter, LogContext, Logger, LoggerConfig } from './types.js';

export type { ErrorReporter, LogContext, Logger, LoggerConfig };
export type { LogTransport } from './types.js';
export { getLoggingConfig } from './config.js';
export { createLogger, pruneOldLogs } from './logger.js';
export { runWithRequestContext, getRequestContext } from './context.js';
export type { RequestExecutionContext } from './context.js';

// ─── Singleton logger ─────────────────────────────────────────────────────────

let _errorReporter: ErrorReporter | null = null;

/**
 * Register a callback that is invoked on every `error` or `fatal` log.
 * Use this to forward logs to Sentry, Datadog, or any APM tool without
 * coupling this package to a specific vendor.
 *
 * @example
 * import * as Sentry from '@sentry/node';
 * setErrorReporter((level, message, ctx) => {
 *   Sentry.captureMessage(message, { level, extra: ctx });
 * });
 */
export const setErrorReporter = (reporter: ErrorReporter): void => {
  _errorReporter = reporter;
};

const config = getLoggingConfig();
const pinoLogger = createLogger(config);

// Non-blocking log retention cleanup on startup.
void pruneOldLogs(config.service, config.rotationDays, config.logsDir);

/**
 * Auto-inject request trace IDs (requestId / correlationId) from
 * AsyncLocalStorage so every log line is correlatable without passing
 * IDs through every function call.
 */
const enrichContext = (context?: LogContext): LogContext | undefined => {
  const reqCtx = getRequestContext();
  const merged: LogContext = { ...context };

  if (merged['requestId'] == null && reqCtx.requestId) {
    merged['requestId'] = reqCtx.requestId;
  }
  if (merged['correlationId'] == null && reqCtx.correlationId) {
    merged['correlationId'] = reqCtx.correlationId;
  }

  const filtered = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined)
  ) as LogContext;

  return Object.keys(filtered).length > 0 ? filtered : undefined;
};

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
  code: (error as Error & { code?: string }).code,
});

export const logger: Logger = {
  debug: (message, context) => {
    pinoLogger.debug({ context: enrichContext(context) }, message);
  },

  info: (message, context) => {
    pinoLogger.info({ context: enrichContext(context) }, message);
  },

  warn: (message, context) => {
    pinoLogger.warn({ context: enrichContext(context) }, message);
  },

  error: (message, error, context) => {
    const enrichedCtx = enrichContext(context);

    if (error) {
      pinoLogger.error({ context: enrichedCtx, error: serializeError(error) }, message);
    } else {
      pinoLogger.error({ context: enrichedCtx }, message);
    }

    _errorReporter?.('error', message, {
      ...enrichedCtx,
      errorName: error?.name,
      errorCode: (error as (Error & { code?: string }) | undefined)?.code,
    });
  },

  fatal: (message, error, context) => {
    const enrichedCtx = enrichContext(context);

    if (error) {
      pinoLogger.fatal({ context: enrichedCtx, error: serializeError(error) }, message);
    } else {
      pinoLogger.fatal({ context: enrichedCtx }, message);
    }

    _errorReporter?.('fatal', message, {
      ...enrichedCtx,
      errorName: error?.name,
      errorCode: (error as (Error & { code?: string }) | undefined)?.code,
    });
  },
};

export default logger;

/**
 * Create a named child logger for a specific module/domain.
 * The returned logger uses the same singleton configuration but adds
 * a `module` field to every log entry for easier filtering.
 *
 * @example
 * const log = createModuleLogger('transactionService');
 * log.info('Deposit created', { transactionId });
 */
export const createModuleLogger = (moduleName: string): Logger => ({
  debug: (message, context) =>
    logger.debug(message, { module: moduleName, ...context }),
  info: (message, context) =>
    logger.info(message, { module: moduleName, ...context }),
  warn: (message, context) =>
    logger.warn(message, { module: moduleName, ...context }),
  error: (message, error, context) =>
    logger.error(message, error, { module: moduleName, ...context }),
  fatal: (message, error, context) =>
    logger.fatal(message, error, { module: moduleName, ...context }),
});
