import { isNetworkError } from '../../api/isNetworkError';

/**
 * The line under «Could not load the unit». No answer from the server (offline, or a timeout
 * on a network that does not reach it) is said in words — "offline, and this unit is not on the
 * phone" — never the client's `Request timed out after 15000ms: /api/v1/…` with its API path.
 * Any other failure keeps its own message.
 */
export function loadErrorLine(error: Error | null | undefined, t: (key: string) => string): string {
  if (isNetworkError(error)) return t('courseHome.unitNotSaved');
  return error?.message ?? '';
}
