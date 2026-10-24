import { apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isPlaced, type SchoolGroup, type StudentSchool } from './schools';

/* ─────────────────────────────────────────────────────────────────────────
 * The learner's next class (mobile redesign 02, step 2).
 *
 * Port of the web's `get-next-class.ts`: scheduling-service
 * `GET /scheduling/groups/:groupId/lessons/next?limit=1` per group — every group the learner
 * is placed in, not only a school's first as on the web — the soonest of them all.
 * Validated rather than trusted: a shape change upstream must read as "no next class", never
 * as `undefined · undefined` on Today. Unlike the web, a class more than two weeks away is
 * none: on the phone an empty slot spends the first screen.
 * ────────────────────────────────────────────────────────────────────── */

export interface NextClass {
  lessonId: string;
  /** YYYY-MM-DD, the school's calendar day. */
  date: string;
  /** HH:MM */
  startTime: string;
  endTime: string;
  room: string | null;
  /** As scheduling-service reports it: `scheduled`, `cancelled`, … */
  status: string;
  schoolId: string;
  schoolName: string;
  groupId: string;
  groupName: string;
  teacher: { userId: string; name: string } | null;
}

/** Further off than this, Today has no class to show. */
export const NEXT_CLASS_HORIZON_DAYS = 14;

interface RawLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
  room: string | null;
  status: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;
const TIME = /^\d{2}:\d{2}/;

/** The first lesson of the answer; null when there is none or it is not a lesson. */
export function parseNextLesson(raw: unknown): RawLesson | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const l = raw[0];
  if (
    !isRecord(l) ||
    !isString(l.id) ||
    !isString(l.date) ||
    !DATE.test(l.date) ||
    !isString(l.startTime) ||
    !TIME.test(l.startTime) ||
    !isString(l.endTime) ||
    !TIME.test(l.endTime) ||
    !isString(l.status)
  ) {
    return null;
  }
  return {
    id: l.id,
    // A full ISO instant or seconds may come back; the card shows the day and HH:MM.
    date: l.date.slice(0, 10),
    startTime: l.startTime.slice(0, 5),
    endTime: l.endTime.slice(0, 5),
    teacherId: stringOrNull(l.teacherId),
    room: stringOrNull(l.room),
    status: l.status,
  };
}

/**
 * The start as a local time on this phone, for «today» / «in 3 days». A function rather than
 * a field: the class is cached as JSON, where a `Date` comes back as a string.
 */
export function classStart(l: Pick<NextClass, 'date' | 'startTime'>): Date {
  const [y, m, d] = l.date.split('-').map(Number);
  const [hh, mm] = l.startTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

async function nextLessonOf(groupId: string): Promise<RawLesson | null> {
  try {
    return parseNextLesson(
      await apiClient.get(`/api/v1/scheduling/groups/${groupId}/lessons/next`, { query: { limit: 1 } }),
    );
  } catch {
    // scheduling-service down, or the group has no timetable — Today still renders.
    return null;
  }
}

/**
 * The group's roster covers the usual teacher; only one outside it — a substitute — costs a
 * profile lookup, and one that cannot be resolved is no teacher rather than no card.
 */
async function teacherOf(teacherId: string | null, group: SchoolGroup): Promise<NextClass['teacher']> {
  if (!teacherId) return null;
  const known = group.teachers.find((t) => t.userId === teacherId);
  if (known) return known;
  try {
    const profile = await apiClient.get<unknown>(`/api/v1/profiles/${teacherId}`);
    return isRecord(profile) && isString(profile.displayName)
      ? { userId: teacherId, name: profile.displayName }
      : null;
  } catch {
    return null;
  }
}

/**
 * The soonest class across every group the learner is placed in, within the horizon; null
 * when there is none. Never throws: no call here may be why Today fails.
 */
export async function getNextClass(
  schools: readonly StudentSchool[],
  now: Date = new Date(),
): Promise<NextClass | null> {
  const placed = schools
    .filter(isPlaced)
    .flatMap((school) => school.groups.map((group) => ({ school, group })));
  const found = (
    await Promise.all(
      placed.map(async ({ school, group }) => {
        const lesson = await nextLessonOf(group.groupId);
        return lesson ? { school, group, lesson, startsAt: classStart(lesson) } : null;
      }),
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NEXT_CLASS_HORIZON_DAYS + 1);
  const inReach = found.filter((f) => f.startsAt < horizon);
  if (inReach.length === 0) return null;

  const { school, group, lesson } = inReach.reduce((a, b) => (a.startsAt <= b.startsAt ? a : b));
  return {
    lessonId: lesson.id,
    date: lesson.date,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    room: lesson.room,
    status: lesson.status,
    schoolId: school.schoolId,
    schoolName: school.schoolName,
    groupId: group.groupId,
    groupName: group.groupName ?? '',
    teacher: await teacherOf(lesson.teacherId, group),
  };
}
