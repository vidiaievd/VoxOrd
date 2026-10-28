import { useCallback } from 'react';
import { getNextClass, type NextClass } from '../api/nextClass';
import { isPlaced, type StudentSchool } from '../api/schools';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface NextClassState {
  /** null: no class within two weeks, or nothing known. */
  nextClass: NextClass | null;
  refresh: () => Promise<void>;
}

/**
 * The soonest class across the learner's groups. The groups are part of the key: a learner
 * placed in a new group asks again instead of keeping the old group's class.
 */
export function useNextClass(schools: readonly StudentSchool[] | null): NextClassState {
  const { status: authStatus, user } = useAuth();
  const groupIds = (schools ?? [])
    .filter(isPlaced)
    .flatMap((s) => s.groups.map((g) => g.groupId))
    .sort()
    .join(',');
  const key =
    authStatus === 'signedIn' && user && groupIds ? `nextClass:${user.id}:${groupIds}` : null;
  const loader = useCallback(() => getNextClass(schools ?? []), [schools]);
  const { data, refresh } = useSwrResource<NextClass | null>(key, loader);
  return { nextClass: key ? (data ?? null) : null, refresh };
}
