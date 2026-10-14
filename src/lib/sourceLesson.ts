import type { UnitContentsItem, UnitContentsResult } from '../api/types';

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

/**
 * The exercises a text lesson leads into — what «To the exercises» at the end of the text
 * opens, the way a grammar rule opens its practice.
 *
 * Courses lay a text out two ways: its exercises in the text's own section, or the text in a
 * section of its own and the exercises in the sections after it. So: the exercises of the
 * lesson's section; failing that, those of the sections that follow, up to the next section
 * with a text of its own; failing that — the lesson outside any section, or nothing found —
 * every exercise of the unit, which is what the unit screen runs as one set.
 */
export function exercisesForLesson(contents: UnitContentsResult, lessonId: string): string[] {
  const exercisesOf = (items: UnitContentsItem[]) =>
    items.filter((i) => i.contentType === 'exercise').map((i) => i.contentId);
  const hasText = (items: UnitContentsItem[]) =>
    items.some((i) => i.contentType === 'lesson' && i.lessonKind === 'text');

  const all = exercisesOf([
    ...contents.sections.flatMap((s) => s.items),
    ...contents.ungroupedItems,
  ]);

  const at = contents.sections.findIndex((s) => s.items.some((i) => i.contentId === lessonId));
  if (at === -1) return all;

  const own = exercisesOf(contents.sections[at]!.items);
  if (own.length > 0) return own;

  const following: string[] = [];
  for (const section of contents.sections.slice(at + 1)) {
    if (hasText(section.items)) break;
    following.push(...exercisesOf(section.items));
  }
  return following.length > 0 ? following : all;
}
