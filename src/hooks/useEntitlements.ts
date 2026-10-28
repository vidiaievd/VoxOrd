import { useCallback } from 'react';
import { getLearnerEntitlements, isExpired, type Entitlements } from '../api/entitlements';
import { isPlaced, type StudentSchool } from '../api/schools';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface EntitlementsState {
  /**
   * null: not known, or known only from a cache past its `validUntil` — AI that needs the
   * network is off until a fresh answer says otherwise.
   */
  entitlements: Entitlements | null;
  refresh: () => Promise<void>;
}

/**
 * Whose rights Today draws with: the schools' the learner is placed in, else their own (see
 * `api/entitlements.ts`). Waits for the schools to settle, so a school learner is not first
 * asked about on their own plan; the schools are in the key, so joining one asks again.
 */
export function useEntitlements(
  schools: readonly StudentSchool[] | null,
  schoolsStatus: 'loading' | 'loaded' | 'error',
): EntitlementsState {
  const { status: authStatus, user } = useAuth();
  const schoolIds = (schools ?? [])
    .filter(isPlaced)
    .map((s) => s.schoolId)
    .sort();
  const scope = schoolIds.length > 0 ? schoolIds.join(',') : 'self';
  const key =
    authStatus === 'signedIn' && user && schoolsStatus !== 'loading'
      ? `entitlements:${user.id}:${scope}`
      : null;
  const loader = useCallback(
    () => getLearnerEntitlements(scope === 'self' ? [] : scope.split(',')),
    [scope],
  );
  const { data, refresh } = useSwrResource<Entitlements | null>(key, loader);
  const entitlements = key && data && !isExpired(data) ? data : null;
  return { entitlements, refresh };
}
