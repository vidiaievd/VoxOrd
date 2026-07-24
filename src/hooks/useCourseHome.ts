import { useCallback, useEffect, useRef, useState } from 'react';
import { getCourseHome } from '../api/courseHome';
import type { CourseHomePayload } from '../api/types';

export interface CourseHomeState {
  status: 'loading' | 'loaded' | 'error';
  data: CourseHomePayload | null;
  error: Error | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useCourseHome(courseId: string): CourseHomeState {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<CourseHomePayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setStatus('loading');
      }
      try {
        const result = await getCourseHome(courseId);
        if (!mounted.current) return;
        setData(result);
        setStatus('loaded');
        setError(null);
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [courseId],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { status, data, error, refreshing, refresh };
}
