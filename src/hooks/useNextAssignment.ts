import { useCallback } from 'react';
import { getNextAssignment, type NextAssignment } from '../api/assignments';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface NextAssignmentState {
  /** null: none due, none that can be named, or nothing known. */
  assignment: NextAssignment | null;
  refresh: () => Promise<void>;
}

/** The soonest active assignment, cached per user. Only asked for when `enabled`. */
export function useNextAssignment(enabled: boolean): NextAssignmentState {
  const { status: authStatus, user } = useAuth();
  const key = enabled && authStatus === 'signedIn' && user ? `assignment:${user.id}` : null;
  const loader = useCallback(() => getNextAssignment(), []);
  const { data, refresh } = useSwrResource<NextAssignment | null>(key, loader);
  return { assignment: key ? (data ?? null) : null, refresh };
}
