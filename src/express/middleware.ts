import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../index.js';
import { runWithRequestContext } from '../context.js';

type OnRequestHook = (req: Request) => void;

let _onRequestHook: OnRequestHook | null = null;

/**
 * Register a callback invoked after request IDs are assigned but before `next()`.
 * Use this to attach Sentry or APM request context without coupling this package
 * to a specific vendor.
 *
 * @example
 * import * as Sentry from '@sentry/node';
 * setRequestHook((req) => {
 *   Sentry.setTag('request_id', req.requestId);
 *   Sentry.setTag('correlation_id', req.correlationId);
 * });
 */
export const setRequestHook = (hook: OnRequestHook): void => {
  _onRequestHook = hook;
};

const readHeader = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string' && first.trim().length > 0) return first.trim();
  }
  return undefined;
};

/**
 * Express middleware that:
 *  1. Reads or generates `x-request-id` and `x-correlation-id`
 *  2. Attaches them to `req.requestId` / `req.correlationId`
 *  3. Echoes them back on the response
 *  4. Wraps the request in an `AsyncLocalStorage` scope so downstream
 *     `logger` calls automatically include the IDs
 *  5. Logs `'Incoming request'` at info level
 *
 * Register early in your Express app, after body parsers:
 *   app.use(requestContextMiddleware);
 */
export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId =
    readHeader(req.headers['x-request-id']) ?? `req_${crypto.randomUUID()}`;
  const correlationId =
    readHeader(req.headers['x-correlation-id']) ?? `corr_${crypto.randomUUID()}`;

  (req as Request & { requestId?: string }).requestId = requestId;
  (req as Request & { correlationId?: string }).correlationId = correlationId;

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  runWithRequestContext({ requestId, correlationId }, () => {
    _onRequestHook?.(req);

    logger.info('Incoming request', {
      requestId,
      correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    next();
  });
};
