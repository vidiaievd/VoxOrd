import type {
  CourseHomePayload,
  UnitContentsItem,
  UnitContentsResult,
} from '../api/types';

export interface NextItem {
  unitId: string;
  item: UnitContentsItem;
}

/** A unit's materials in the order its screen lists them: sections, then the ungrouped rest. */
export function itemsInOrder(contents: UnitContentsResult): UnitContentsItem[] {
  return [...contents.sections.flatMap((s) => s.items), ...contents.ungroupedItems];
}

/** A container is a heading the learner cannot open; everything else opens on its own. */
const opensOnItsOwn = (i: UnitContentsItem) => i.contentType !== 'container';

/** In one unit: the material already begun, else the first open one. Handed-in work waits. */
export function nextInUnit(contents: UnitContentsResult): UnitContentsItem | null {
  const items = itemsInOrder(contents).filter(opensOnItsOwn);
  return (
    items.find((i) => i.status === 'in_progress') ??
    items.find((i) => i.status === 'available') ??
    null
  );
}

/**
 * The material «Continue» opens (Courses spec §9): in the first active unit, the material
 * begun, else the first open one; when that unit has nothing left, the first open material
 * of a later unit that is not locked. null when nothing is left — or when the contents of a
 * unit on the way are not known, since anything beyond it could skip work still to do.
 */
export function nextItem(
  course: Pick<CourseHomePayload, 'units'>,
  unitContents: Readonly<Record<string, UnitContentsResult | undefined>>,
): NextItem | null {
  const units = [...course.units].sort((a, b) => a.position - b.position);
  const start = units.findIndex((u) => u.status === 'active');
  if (start === -1) return null;

  for (const unit of units.slice(start)) {
    if (unit.status !== 'active') continue;
    const contents = unitContents[unit.id];
    if (!contents) return null;
    const item = nextInUnit(contents);
    if (item) return { unitId: unit.id, item };
  }
  return null;
}
