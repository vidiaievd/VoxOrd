import { useCallback } from 'react';
import { getMyCourses, CourseListItem } from '../api/courses';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface MyCoursesState {
  status: 'loading' | 'loaded' | 'error';
  courses: CourseListItem[];
  error: Error | null;
  refreshing: boolean;
  /** True while `courses` is a cached value shown ahead of a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate (Phase 6): cache keyed per user so switching
 * accounts on the same device never shows a stranger's course list.
 */
export function useMyCourses(): MyCoursesState {
  const { status: authStatus, user } = useAuth();
  const loader = useCallback(getMyCourses, []);
  const { status, data, error, refreshing, stale, refresh } = useSwrResource<CourseListItem[]>(
    authStatus === 'signedIn' && user ? `courses:${user.id}` : null,
    loader,
  );

  return { status, courses: data ?? [], error, refreshing, stale, refresh };
}
