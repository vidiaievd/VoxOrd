import { ApiError, apiClient } from './client';
import { isRecord, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/**
 * The name the learner goes by: user-profile-service `GET /api/v1/profiles/me`. Null when
 * there is none (or the profile is refused); throws when the server is out of reach, so a
 * cached name stays.
 */
export async function getMyDisplayName(): Promise<string | null> {
  try {
    const raw = await apiClient.get<unknown>('/api/v1/profiles/me');
    const name = isRecord(raw) ? stringOrNull(raw.displayName)?.trim() : null;
    return name ? name : null;
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}
