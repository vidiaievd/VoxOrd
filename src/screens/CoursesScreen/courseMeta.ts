import type { CourseListItem } from '../../api/courses';
import type { CourseHomePayload } from '../../api/types';

export interface CourseProgress {
  unitsDone: number;
  unitsTotal: number;
  /** 0..100 */
  pct: number;
}

export function courseProgress(home: CourseHomePayload | null): CourseProgress | null {
  if (!home) return null;
  return {
    unitsDone: home.units.filter(u => u.status === 'done').length,
    unitsTotal: home.units.length,
    pct: Math.round(home.progress.percentComplete),
  };
}

/** «Now studying» is the course opened last, else the first in the list (no activity date yet). */
export function pickCurrent(
  courses: readonly CourseListItem[],
  lastId: string | null,
): CourseListItem | null {
  return courses.find(c => c.container.id === lastId) ?? courses[0] ?? null;
}

/** A school's enrollment carries its school id; the rest is self-study. */
export const isSelfStudy = (c: CourseListItem) => c.enrollment.schoolId === null;
