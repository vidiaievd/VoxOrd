import type { UnitContentsResult } from '../api/types';

/**
 * The lesson the exercises of a unit were set on — where «To the text» goes back to.
 *
 * A sub-lesson is built around one passage and the exercises under it ask about that
 * passage, so the parent is the unit's own text lesson rather than something the author
 * points at: no builder writes a lesson id, and plan 54 Q5 decided none should have to.
 * Null when the unit holds no text — a listening unit, a unit that is only practice — and
 * the runner then offers no link at all.
 *
 * The web reader resolves it the same way (`findSourceLessonItemId`), from the same
 * payload; what differs is only what the two navigate with — a route id there, a content
 * id here.
 */
export function findSourceLessonId(contents: UnitContentsResult): string | null {
  const items = [...contents.sections.flatMap((s) => s.items), ...contents.ungroupedItems];
  const lesson = items.find((i) => i.contentType === 'lesson' && i.lessonKind === 'text');
  return lesson?.contentId ?? null;
}
