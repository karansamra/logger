/**
 * logger/express — Express-specific adapters
 *
 * Import path: 'logger/express'
 * Peer dependency: express >= 4
 *
 * @example
 * import { requestContextMiddleware, logInfo, logError } from 'logger/express';
 *
 * // In your Express app setup:
 * app.use(requestContextMiddleware);
 *
 * // In controllers:
 * logInfo(req, 'User signed in', { userId });
 * logError(req, 'Sign-in failed', error);
 */

export { requestContextMiddleware, setRequestHook } from './middleware.js';
export { logInfo, logWarn, logDebug, logError } from './logHelper.js';
