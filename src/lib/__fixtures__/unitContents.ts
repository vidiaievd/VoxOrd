import type {
  UnitContentsItem,
  UnitContentsItemStatus,
  UnitContentsResult,
  UnitSummary,
} from '../../api/types';

/** Course and unit-contents builders for the «what's next» tests. */

export const unit = (position: number, status: UnitSummary['status']): UnitSummary => ({
  id: `u${position}`,
  position,
  title: `Unit ${position}`,
  status,
  completedLessons: 0,
  totalLessons: 3,
});

export const item = (
  id: string,
  status: UnitContentsItemStatus,
  contentType: UnitContentsItem['contentType'] = 'exercise',
): UnitContentsItem => ({
  id,
  contentType,
  contentId: `c-${id}`,
  title: id,
  lessonKind: null,
  durationMinutes: 5,
  xpReward: null,
  status,
  masteryPercent: null,
});

export const contents = (
  sections: UnitContentsItem[][],
  ungroupedItems: UnitContentsItem[] = [],
): UnitContentsResult => ({
  moduleId: 'm',
  moduleTitle: null,
  sections: sections.map((items, i) => ({ id: `s${i}`, title: `S${i}`, items })),
  ungroupedItems,
});
