import type { PublicSchool, SchoolApplication } from '../api/schools';

/**
 * The «Find a school» list and a school's page (mobile redesign 04, step 9c).
 *
 * Search runs on the phone over everything the server returned, as the web's `/discover` does:
 * name, description and city, case-insensitive; the list is in name order.
 */
export function filterSchools(list: readonly PublicSchool[], query: string): PublicSchool[] {
  const q = query.trim().toLowerCase();
  const hits = q
    ? list.filter(s =>
        [s.name, s.description, s.city].some(field => field?.toLowerCase().includes(q)),
      )
    : [...list];
  return hits.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What the school's page offers the learner, from the school and their latest application —
 * the web's `ApplyCta` states, less the guest one (the phone is always signed in):
 * - `apply` — never applied, the school takes applications;
 * - `closed` — never applied, by invitation only;
 * - `pending` — waiting for the school to decide;
 * - `accepted` — let in, the school is still placing them (`onboarding`, `placement-review`);
 * - `member` — studying there: an `active` application, or placed in a group whatever the
 *   application says (`isPlaced` — the owner's rule of 2026-10-24, as on Today);
 * - `reapply` — rejected or left; a fresh application is a new one (the web allows it too).
 */
export type ApplicationState = 'apply' | 'closed' | 'pending' | 'accepted' | 'member' | 'reapply';

export function applicationState(
  school: Pick<PublicSchool, 'isOpenForApplications'>,
  application: SchoolApplication | null,
  placed = false,
): ApplicationState {
  if (placed) return 'member';
  if (!application) return school.isOpenForApplications ? 'apply' : 'closed';
  switch (application.status) {
    case 'active':
      return 'member';
    case 'onboarding':
    case 'placement-review':
      return 'accepted';
    case 'rejected':
    case 'left':
      return school.isOpenForApplications ? 'reapply' : 'closed';
    default:
      return 'pending';
  }
}

/** The levels a learner may name in an application (the server's own list). */
export const SELF_REPORTED_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** The site's host, shown instead of the whole address. */
export function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Up to two letters for a school without an avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}
