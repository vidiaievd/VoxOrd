import { ApiError } from './client';

/** True for connectivity failures (no response reached the server), not 4xx/5xx. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT');
}

/**
 * The server was not reached, or answered as one that is down (5xx) — what the phone answers
 * by working from what it keeps (offline plan). A refusal (4xx) is the server speaking, and
 * stands.
 */
export function isServerOutOfReach(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  return error instanceof ApiError && error.status !== null && error.status >= 500;
}
