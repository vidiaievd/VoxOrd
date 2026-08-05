import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyCourses, CourseListItem } from '../api/courses';
import { useAuth } from './useAuth';

export interface MyCoursesState {
  status: 'loading' | 'loaded' | 'error';
  courses: CourseListItem[];
  error: Error | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useMyCourses(): MyCoursesState {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setStatus('loading');
    }
    try {
      const result = await getMyCourses();
      if (!mounted.current) return;
      setCourses(result);
      setStatus('loaded');
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'signedIn') {
      load(false);
    }
  }, [authStatus, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { status, courses, error, refreshing, refresh };
}
