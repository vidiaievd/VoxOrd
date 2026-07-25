import { ApiError } from './client';

/** True for connectivity failures (no response reached the server), not 4xx/5xx. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT');
}
