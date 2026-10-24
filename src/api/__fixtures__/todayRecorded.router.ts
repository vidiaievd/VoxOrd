import { ApiError } from '../client';
import { recorded } from './todayRecorded';

export const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
export const USER_ID = '182558cf-f90b-464f-84a4-5a68610b7f94';

/** A gateway that answers as the dev stack did, with a hook to change any one answer. */
export function recordedGateway(
  override: (path: string, query?: Record<string, unknown>) => unknown = () => undefined,
) {
  return async (path: string, options?: { query?: Record<string, unknown> }) => {
    const changed = override(path, options?.query);
    if (changed instanceof Error) throw changed;
    if (changed !== undefined) return changed;

    const base = `/api/v1/schools/${SCHOOL_ID}`;
    if (path === '/api/v1/schools') return recorded.schools;
    if (path === `${base}/memberships/me`) return recorded.membership;
    if (path === `${base}/students/${USER_ID}/memberships`) return recorded.placements;
    const group = path.match(/\/groups\/([^/]+)$/);
    if (group && path.startsWith(base)) {
      return recorded.groups[group[1] as keyof typeof recorded.groups];
    }
    const lessons = path.match(/^\/api\/v1\/scheduling\/groups\/([^/]+)\/lessons\/next$/);
    if (lessons) return recorded.nextLessons[lessons[1] as keyof typeof recorded.nextLessons];
    const container = path.match(/^\/api\/v1\/containers\/([^/]+)$/);
    if (container) {
      return { title: recorded.containerTitles[container[1] as keyof typeof recorded.containerTitles] };
    }
    if (path === '/api/v1/subscriptions/me') {
      return options?.query?.workspaceId ? recorded.entitlementsSchool : recorded.entitlementsSelf;
    }
    throw new ApiError({ message: `no route ${path}`, status: 404 });
  };
}
