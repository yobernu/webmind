/**
 * A signal that aborts when the caller's does or when `ms` elapses, whichever
 * comes first. Provider SDKs and fetch only take one signal, and a hung
 * provider must not hold a request (and its database work) open forever.
 */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Raised when a provider call ran out of time rather than failing outright. */
export class ProviderTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'ProviderTimeoutError';
  }
}
