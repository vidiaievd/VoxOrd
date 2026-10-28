import { useCallback } from 'react';
import { getStudentSchools, type StudentSchool } from '../api/schools';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface SchoolsState {
  status: 'loading' | 'loaded' | 'error';
  /** null: not loaded, failed with nothing cached, or unreadable — Today reads it as no school. */
  schools: StudentSchool[] | null;
  refresh: () => Promise<void>;
}

/** The learner's schools, cached per user so another account's schools never show. */
export function useSchools(): SchoolsState {
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;
  const loader = useCallback(() => getStudentSchools(userId!), [userId]);
  const { status, data, refresh } = useSwrResource<StudentSchool[] | null>(
    userId ? `schools:${userId}` : null,
    loader,
  );
  return { status, schools: data ?? null, refresh };
}
