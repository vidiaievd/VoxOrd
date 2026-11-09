import { useCallback } from 'react';
import { getPublicSchools, getSchoolPage, type PublicSchool, type SchoolPage } from '../api/schools';
import { useAuth } from './useAuth';
import { useSwrResource, type SwrResourceState } from './useSwrResource';

/** Every school with a public page (plan 04 step 9c), cached per user like the catalogue. */
export function usePublicSchools(): SwrResourceState<PublicSchool[]> {
  const { status, user } = useAuth();
  const loader = useCallback(getPublicSchools, []);
  return useSwrResource<PublicSchool[]>(status === 'signedIn' && user ? `publicSchools:${user.id}` : null, loader);
}

/** One school's page with the learner's application to it. */
export function useSchoolPage(slug: string): SwrResourceState<SchoolPage> {
  const { status, user } = useAuth();
  const loader = useCallback(() => getSchoolPage(slug), [slug]);
  return useSwrResource<SchoolPage>(status === 'signedIn' && user ? `schoolPage:${user.id}:${slug}` : null, loader);
}
