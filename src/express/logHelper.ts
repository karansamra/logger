/**
 * Request-scoped logging helpers for Express controllers.
 *
 * Each function automatically enriches the log with:
 *   - requestId, correlationId (from req)
 *   - ip, userAgent, method, path
 *   - authUserId, organizationId (when present on req.user / req.session)
 *   - any `extra` fields you pass
 *
 * Usage in controllers:
 *   import { logInfo, logError } from 'logger/express';
 *
 *   logInfo(req, 'Deposit created', { depositId: result.id });
 *   logError(req, 'Deposit failed', error, { userId });
 */

import type { Request } from 'express';
import { logger } from '../index.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

type RequestWithActor = Request & {
  requestId?: string;
  correlationId?: string;
  user?: {
    user_id?: string;
    organization?: { id?: string };
  };
  session?: { user?: { user_id?: string } };
  organizationId?: string;
};

type ActorContext = {
  authUserId?: string;
  organizationId?: string;
};

const getActor = (req: Request): ActorContext => {
  const r = req as RequestWithActor;
  return {
    authUserId: r.user?.user_id ?? r.session?.user?.user_id,
    organizationId: r.organizationId ?? r.user?.organization?.id,
  };
};

const getBaseContext = (req: Request) => {
  const r = req as RequestWithActor;
  return {
    requestId: r.requestId,
    correlationId: r.correlationId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    path: req.path,
    ...getActor(req),
  };
};

const normalizeError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);

  if (typeof value === 'object' && value !== null && 'message' in value) {
    const msg = (value as { message?: unknown }).message;
    return new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
};

// ─── Public helpers ───────────────────────────────────────────────────────────

export const logInfo = (req: Request, message: string, extra: object = {}): void => {
  logger.info(message, { ...getBaseContext(req), ...extra });
};

export const logWarn = (req: Request, message: string, extra: object = {}): void => {
  logger.warn(message, { ...getBaseContext(req), ...extra });
};

export const logDebug = (req: Request, message: string, extra: object = {}): void => {
  logger.debug(message, { ...getBaseContext(req), ...extra });
};

export const logError = (
  req: Request,
  message: string,
  error: unknown = {},
  extra: object = {}
): void => {
  const normalized = normalizeError(error);
  logger.error(message, normalized, {
    ...getBaseContext(req),
    errorCode: (normalized as Error & { code?: string | number }).code,
    ...extra,
  });
};
