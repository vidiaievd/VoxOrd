import { ApiError, apiClient } from './client';
import { getContainer } from './courses';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * The schools the learner studies in, with their group (mobile redesign 02, step 2).
 *
 * Port of the web's `get-student-schools.ts`, cut to what the phone shows: the school, the
 * membership status, and every group the learner is placed in — the web keeps the first one
 * only — with its teachers and the courses it opens. Contract read
 * 2026-10-24 from organization-service (schools, memberships and groups controllers) through
 * the web's calls; all four routes are JWT routes under `/api/v1/schools` on the gateway.
 *
 * Every lookup past the list degrades on its own, as on the web: a membership that cannot be
 * read drops that school, a group that cannot be read leaves the row without courses, a course
 * whose title cannot be read keeps its id with no name.
 * ────────────────────────────────────────────────────────────────────── */

export interface SchoolTeacher {
  userId: string;
  name: string;
}

/** A course a group opens to its learners: the main one, or an additional material. */
export interface SchoolMaterial {
  courseId: string;
  courseName: string | null;
}

/** A group the learner is placed in, with what it opens to them. */
export interface SchoolGroup {
  groupId: string;
  groupName: string | null;
  teachers: SchoolTeacher[];
  mainCourse: SchoolMaterial | null;
  materials: SchoolMaterial[];
}

export interface StudentSchool {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  /** The application's status: `active`, `onboarding`, `placement-review`, … */
  status: string;
  /** The first group of `groups`, for a one-line mention; null until the school places them. */
  groupId: string | null;
  groupName: string | null;
  /** Every group the learner is placed in now — a learner can sit in several. */
  groups: SchoolGroup[];
}

/** Applications that ended: whatever placement is left over opens nothing. */
const CLOSED_STATUSES = new Set(['rejected', 'left']);

/**
 * Studying at the school: placed in a group, whatever the application's status. Placement,
 * not the application, opens a group — a school can place a learner still `onboarding` —
 * so the owner chose this over the spec's `status === 'active'` (2026-10-24).
 */
export function isPlaced(s: { status: string; groupId: string | null }): boolean {
  return !!s.groupId && !CLOSED_STATUSES.has(s.status);
}

const SCHOOLS_PATH = '/api/v1/schools';

/** A failed lookup past the list: nothing to show for it, the row still stands. */
async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** The ids of the schools where the caller is a student; null when the list is not a list. */
export function parseStudentSchoolList(raw: unknown): { id: string; name: string }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(isRecord)
    .filter((s) => s.myRole === 'STUDENT' && isString(s.id) && isString(s.name))
    .map((s) => ({ id: s.id as string, name: s.name as string }));
}

export function parseMembership(raw: unknown): { id: string; status: string } | null {
  if (!isRecord(raw) || !isString(raw.id) || !isString(raw.status)) return null;
  return { id: raw.id, status: raw.status };
}

interface Placement {
  groupId: string;
  groupName: string | null;
  teachers: SchoolTeacher[];
}

/**
 * The groups the learner is placed in now: an active placement in a group that is itself
 * still running (`groupStatus`, when the answer carries it).
 */
export function parsePlacements(raw: unknown): Placement[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(isRecord)
    .filter(
      (g) =>
        g.status === 'active' &&
        isString(g.groupId) &&
        (g.groupStatus === undefined || g.groupStatus === 'active'),
    )
    .map((g) => {
      const teachers = Array.isArray(g.teachers) ? g.teachers.filter(isRecord) : [];
      return {
        groupId: g.groupId as string,
        groupName: stringOrNull(g.groupName),
        teachers: teachers
          .filter((t) => isString(t.userId) && isString(t.name))
          .map((t) => ({ userId: t.userId as string, name: t.name as string })),
      };
    });
}

/** The course ids a group opens: its main course, then its additional materials. */
export function parseGroupCourses(raw: unknown): { main: string | null; materials: string[] } | null {
  if (!isRecord(raw)) return null;
  const materials = Array.isArray(raw.materials) ? raw.materials.filter(isRecord) : [];
  return {
    main: stringOrNull(raw.courseId),
    materials: materials.map((m) => m.courseId).filter(isString),
  };
}

async function courseNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, (await optional(() => getContainer(id)))?.title ?? null] as const),
  );
  return new Map(entries.filter((e): e is [string, string] => isString(e[1])));
}

async function schoolGroup(base: string, placement: Placement): Promise<SchoolGroup> {
  const courses = parseGroupCourses(
    await optional(() => apiClient.get(`${base}/groups/${placement.groupId}`)),
  );
  const ids = courses ? [...(courses.main ? [courses.main] : []), ...courses.materials] : [];
  const names = await courseNames(ids);
  const material = (courseId: string): SchoolMaterial => ({
    courseId,
    courseName: names.get(courseId) ?? null,
  });
  return {
    ...placement,
    mainCourse: courses?.main ? material(courses.main) : null,
    materials: (courses?.materials ?? []).map(material),
  };
}

async function studentSchool(
  school: { id: string; name: string },
  userId: string,
): Promise<StudentSchool | null> {
  const base = `${SCHOOLS_PATH}/${school.id}`;
  const membership = parseMembership(await optional(() => apiClient.get(`${base}/memberships/me`)));
  if (!membership) return null;

  const placements =
    parsePlacements(await optional(() => apiClient.get(`${base}/students/${userId}/memberships`))) ?? [];
  const groups = await Promise.all(placements.map((p) => schoolGroup(base, p)));

  return {
    membershipId: membership.id,
    schoolId: school.id,
    schoolName: school.name,
    status: membership.status,
    groupId: groups[0]?.groupId ?? null,
    groupName: groups[0]?.groupName ?? null,
    groups,
  };
}

/**
 * One row per school the learner is a student of. Throws only when organization-service is
 * out of reach, so a cached answer stays on screen; any other failure, or a list that is not
 * a list, is `null` — nothing known about schools, which Today reads as none.
 */
export async function getStudentSchools(userId: string): Promise<StudentSchool[] | null> {
  let raw: unknown;
  try {
    raw = await apiClient.get(SCHOOLS_PATH);
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
  const schools = parseStudentSchoolList(raw);
  if (!schools) return null;
  const rows = await Promise.all(schools.map((s) => studentSchool(s, userId)));
  return rows.filter((r): r is StudentSchool => r !== null);
}
