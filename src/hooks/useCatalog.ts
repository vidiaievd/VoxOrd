import { useCallback } from 'react';
import { getCatalog, getCatalogCourse, type CatalogCourseDetail } from '../api/catalog';
import type { Container } from '../api/types';
import { useAuth } from './useAuth';
import { useSwrResource, type SwrResourceState } from './useSwrResource';

/** The public course list, cached per user like the learner's own courses; `enabled` false loads nothing. */
export function useCatalog(enabled = true): SwrResourceState<Container[]> {
  const { status, user } = useAuth();
  const loader = useCallback(getCatalog, []);
  return useSwrResource<Container[]>(
    enabled && status === 'signedIn' && user ? `catalog:${user.id}` : null,
    loader,
  );
}

/** One catalogue course with its programme (spec 5c). */
export function useCatalogCourse(containerId: string): SwrResourceState<CatalogCourseDetail> {
  const { status, user } = useAuth();
  const loader = useCallback(() => getCatalogCourse(containerId), [containerId]);
  return useSwrResource<CatalogCourseDetail>(
    status === 'signedIn' && user ? `catalogCourse:${user.id}:${containerId}` : null,
    loader,
  );
}
