import type { UnitSummary } from '../../api/types';

/**
 * The unit «Continue» opens: the first one open and not finished. A finished course has
 * none, and gets its last unit — something to go back over rather than a dead card.
 */
export function nextUnit(units: readonly UnitSummary[]): UnitSummary | null {
  const sorted = [...units].sort((a, b) => a.position - b.position);
  return sorted.find((u) => u.status === 'active') ?? sorted[sorted.length - 1] ?? null;
}

/** Which of the learner's courses Home leads with: the one opened last, else the first. */
export function pickCourseId(courseIds: readonly string[], lastId: string | null): string | null {
  if (lastId !== null && courseIds.includes(lastId)) return lastId;
  return courseIds[0] ?? null;
}
