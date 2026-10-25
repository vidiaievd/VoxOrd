import type { MasteryVerdict } from '../../api/masteryProfile';
import { isPlaced, type StudentSchool } from '../../api/schools';
import type { SubmissionStatus } from '../../api/submissions';
import type { TagVariant } from '../../components/ui';
import { calendarDaysUntil, type Translate } from './dayLine';

/* ─────────────────────────────────────────────────────────────────────────
 * What blocks 3, 6, 7 and 11 decide before they draw (mobile redesign 02, step 6) — pure, so
 * the rules are tested without rendering.
 * ────────────────────────────────────────────────────────────────────── */

/** Block 3: one line per school whose group opened a course the learner has not opened yet. */
export interface GroupNotice {
  membershipId: string;
  groupName: string;
  schoolName: string;
  courseId: string;
  courseName: string | null;
}

/**
 * Per school, the first placed group that opens anything — its main course, else its first
 * material. Gone once the learner has opened that course on this phone (the phone has no
 * progress feed, so «opened» is what it knows) or hid the line.
 */
export function groupNotices(
  schools: readonly StudentSchool[] | null,
  openedCourseIds: ReadonlySet<string>,
  dismissedMemberships: ReadonlySet<string>,
): GroupNotice[] {
  const notices: GroupNotice[] = [];
  for (const school of schools ?? []) {
    if (!isPlaced(school) || dismissedMemberships.has(school.membershipId)) continue;
    for (const group of school.groups) {
      const course = group.mainCourse ?? group.materials[0] ?? null;
      if (!course) continue;
      if (!openedCourseIds.has(course.courseId)) {
        notices.push({
          membershipId: school.membershipId,
          groupName: group.groupName ?? '',
          schoolName: school.schoolName,
          courseId: course.courseId,
          courseName: course.courseName,
        });
      }
      break;
    }
  }
  return notices;
}

/** Block 6: a submission's state as a tag — the spec's «partial» and «failed» never occur. */
export function statusTag(status: SubmissionStatus): { key: string; variant: TagVariant } {
  switch (status) {
    case 'approved':
      return { key: 'today.status.passed', variant: 'accent' };
    case 'returned':
      return { key: 'today.status.rewrite', variant: 'outline' };
    case 'pending':
      return { key: 'today.status.atTeacher', variant: 'neutral' };
  }
}

/** Block 7: «today», «tomorrow», «in 3 days». */
export function classRelative(at: Date, now: Date, t: Translate): string {
  const days = calendarDaysUntil(at, now);
  if (days <= 0) return t('today.nextClass.today');
  if (days === 1) return t('today.nextClass.tomorrow');
  return t('today.nextClass.inDays', { count: days });
}

/** At most three: a list of suggestions long enough to scroll is one nobody acts on. */
export const WORK_ON_THIS_MAX = 3;

/**
 * Block 11: the weak cells as topics — the skill when known, else the subject; a cell that
 * knows neither is the platform admitting it does not know, and is left out (web `phrase()`).
 * Two cells naming the same topic are one topic.
 */
export function workOnThisTopics(weak: readonly MasteryVerdict[], t: Translate): string[] {
  const topics: string[] = [];
  for (const v of weak) {
    const name =
      v.skill !== 'unknown'
        ? t(`today.workOnThis.skill.${v.skill}`)
        : v.focus !== 'unknown'
          ? t(`today.workOnThis.focus.${v.focus}`)
          : null;
    if (name && !topics.includes(name)) topics.push(name);
    if (topics.length === WORK_ON_THIS_MAX) break;
  }
  return topics;
}

/** One criterion's mark on an essay. */
export interface CriterionMark {
  name: string;
  mark: number;
}

/**
 * The marks of a one-text answer (`itemId:criterionId` → 0–3), in rubric order and named from
 * the rubric snapshot. Null when there are none, or when they span several items — a set of
 * sentences is not graded out of a rubric, and a list of repeated names would say nothing.
 */
export function criterionMarks(
  rubricMarks: unknown,
  criteria: ReadonlyMap<string, string>,
): CriterionMark[] | null {
  if (typeof rubricMarks !== 'object' || rubricMarks === null || Array.isArray(rubricMarks)) {
    return null;
  }
  const byCriterion = new Map<string, number>();
  const items = new Set<string>();
  for (const [key, mark] of Object.entries(rubricMarks)) {
    const at = key.lastIndexOf(':');
    if (at <= 0 || typeof mark !== 'number') continue;
    items.add(key.slice(0, at));
    byCriterion.set(key.slice(at + 1), mark);
  }
  if (byCriterion.size === 0 || items.size !== 1) return null;
  const marks: CriterionMark[] = [];
  for (const [id, name] of criteria) {
    const mark = byCriterion.get(id);
    if (mark !== undefined) marks.push({ name: name || id, mark });
  }
  return marks.length > 0 ? marks : null;
}
