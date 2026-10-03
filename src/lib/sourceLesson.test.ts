import type { UnitContentsItem, UnitContentsResult } from '../api/types';
import { findSourceLessonId } from './sourceLesson';

function item(over: Partial<UnitContentsItem> & { id: string }): UnitContentsItem {
  return {
    contentType: 'exercise',
    contentId: `c-${over.id}`,
    title: null,
    lessonKind: null,
    durationMinutes: null,
    xpReward: null,
    status: 'available',
    masteryPercent: null,
    ...over,
  };
}

function contents(over: Partial<UnitContentsResult> = {}): UnitContentsResult {
  return {
    moduleId: 'm1',
    moduleTitle: '1A',
    sections: [],
    ungroupedItems: [],
    ...over,
  };
}

describe('findSourceLessonId', () => {
  it("picks the unit's text lesson, wherever in the unit it sits", () => {
    const result = findSourceLessonId(
      contents({
        sections: [
          { id: 's1', title: 'Øvelser', items: [item({ id: 'e1' })] },
          {
            id: 's2',
            title: 'Tekst',
            items: [item({ id: 't1', contentType: 'lesson', lessonKind: 'text' })],
          },
        ],
      }),
    );

    expect(result).toBe('c-t1');
  });

  it('reads the ungrouped items too', () => {
    const result = findSourceLessonId(
      contents({ ungroupedItems: [item({ id: 't1', contentType: 'lesson', lessonKind: 'text' })] }),
    );

    expect(result).toBe('c-t1');
  });

  it('has nothing to offer a unit with no text', () => {
    const result = findSourceLessonId(
      contents({
        sections: [
          {
            id: 's1',
            title: 'Lytting',
            items: [
              item({ id: 'a1', contentType: 'lesson', lessonKind: 'audio' }),
              item({ id: 'e1' }),
            ],
          },
        ],
      }),
    );

    expect(result).toBeNull();
  });
});
