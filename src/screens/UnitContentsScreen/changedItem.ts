import type { UnitContentsItem } from '../../api/types';

/**
 * The first item whose status differs between the unit as it was shown (the cached copy, from
 * before the learner left for a text or a set) and as it is now — the row the screen scrolls
 * to on return. Items new to the unit do not count.
 */
export function firstChangedItem(
  before: UnitContentsItem[],
  after: UnitContentsItem[],
): UnitContentsItem | null {
  const was = new Map(before.map(i => [i.id, i.status]));
  return after.find(i => was.has(i.id) && was.get(i.id) !== i.status) ?? null;
}
