import { useMemo } from 'react';
import type { CourseHomePayload } from '../api/types';
import { useSwrResource } from './useSwrResource';
import { courseHomeResource } from '../lib/courseResources';

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
  const resource = useMemo(() => courseHomeResource(courseId), [courseId]);
  return useSwrResource<CourseHomePayload>(resource.key, resource.load);
}
