import { useCallback } from 'react';
import { getCourseHome } from '../api/courseHome';
import type { CourseHomePayload } from '../api/types';
import { useSwrResource } from './useSwrResource';

export interface CourseHomeState {
  status: 'loading' | 'loaded' | 'error';
  data: CourseHomePayload | null;
  error: Error | null;
  refreshing: boolean;
  /** True while `data` is a cached value shown ahead of a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/** Stale-while-revalidate (Phase 6): reopening a recently-viewed course is instant. */
export function useCourseHome(courseId: string): CourseHomeState {
  const loader = useCallback(() => getCourseHome(courseId), [courseId]);
  return useSwrResource<CourseHomePayload>(`course-home:${courseId}`, loader);
}
