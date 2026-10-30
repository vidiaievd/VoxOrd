import type { UnitContentsResult } from '../../api/types';
import { openContentItem } from '../../lib/openContentItem';
import type { Screen } from '../../navigation/screens';
import type { Resume } from './nextItem';

/**
 * Where «Continue» goes (Home spec §6.2, block 4). The exact material when it can be opened —
 * on the screen the unit's own row opens it on (`openContentItem`). Otherwise the place that
 * shows what there is — the unit when its contents are out of reach, or when offline the next
 * step is not on the phone; the course when it is finished.
 */
export function resumeTarget(
  resume: Resume,
  courseId: string,
  contents: UnitContentsResult | null,
): Screen {
  if (resume.kind === 'courseDone') return { name: 'CourseHome', courseId };
  const unitId = resume.unit.id;
  const unitScreen: Screen = { name: 'UnitContents', unitId, courseId };
  if (resume.kind === 'unit' || !contents) return unitScreen;

  const { item, meta } = resume.next;
  if (meta.availability === 'needsNetwork') return unitScreen;

  return openContentItem(item, contents, { unitId, courseId }) ?? unitScreen;
}
