import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestExecutionContext {
  requestId?: string;
  correlationId?: string;
}

const store = new AsyncLocalStorage<RequestExecutionContext>();

/**
 * Run `callback` with a request-scoped context (requestId + correlationId).
 * Any code within the callback (or async chains it starts) can call
 * `getRequestContext()` to read the IDs without passing them explicitly.
 */
export const runWithRequestContext = <T>(
  context: RequestExecutionContext,
  callback: () => T
): T => store.run(context, callback);

/**
 * Retrieve the current request context.
 * Returns `{}` when called outside a `runWithRequestContext` scope.
 */
export const getRequestContext = (): RequestExecutionContext =>
  store.getStore() ?? {};
