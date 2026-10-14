import type { UnitContentsItem, UnitContentsResult } from '../api/types';
import { exercisesForLesson, findSourceLessonId } from './sourceLesson';

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

describe('exercisesForLesson', () => {
  const text = (id: string) => item({ id, contentType: 'lesson', lessonKind: 'text' });

  it("takes the exercises of the text's own section", () => {
    const result = exercisesForLesson(
      contents({
        sections: [
          { id: 's1', title: 'Tekst 1', items: [text('t1'), item({ id: 'e1' }), item({ id: 'e2' })] },
          { id: 's2', title: 'Tekst 2', items: [text('t2'), item({ id: 'e3' })] },
        ],
      }),
      'c-t1',
    );
    expect(result).toEqual(['c-e1', 'c-e2']);
  });

  it('takes the sections after a text on its own, up to the next text', () => {
    const result = exercisesForLesson(
      contents({
        sections: [
          { id: 's1', title: 'Tekst', items: [text('t1')] },
          { id: 's2', title: 'Øvelser', items: [item({ id: 'e1' })] },
          { id: 's3', title: 'Mer', items: [item({ id: 'e2' })] },
          { id: 's4', title: 'Tekst 2', items: [text('t2'), item({ id: 'e3' })] },
        ],
      }),
      'c-t1',
    );
    expect(result).toEqual(['c-e1', 'c-e2']);
  });

  it('falls back to every exercise of the unit for a text outside any section', () => {
    const result = exercisesForLesson(
      contents({
        sections: [{ id: 's1', title: 'Øvelser', items: [item({ id: 'e1' })] }],
        ungroupedItems: [text('t1'), item({ id: 'e2' })],
      }),
      'c-t1',
    );
    expect(result).toEqual(['c-e1', 'c-e2']);
  });

  it('is empty for a unit with no exercises at all', () => {
    const result = exercisesForLesson(
      contents({ sections: [{ id: 's1', title: 'Tekst', items: [text('t1')] }] }),
      'c-t1',
    );
    expect(result).toEqual([]);
  });
});
