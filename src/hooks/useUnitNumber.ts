import { useCourseHome } from './useCourseHome';

/**
 * The 1-based number of a unit in its course — the «Unit {n}» a material's header names as
 * its parent. The course home gives it, cached from the screen the learner came through;
 * null until it is known.
 */
export function useUnitNumber(courseId: string, unitId: string): number | null {
  const units = useCourseHome(courseId).data?.units;
  if (!units) return null;
  const at = [...units].sort((a, b) => a.position - b.position).findIndex(u => u.id === unitId);
  return at === -1 ? null : at + 1;
}
