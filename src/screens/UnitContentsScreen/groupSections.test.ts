import type { UnitContentsItem, UnitContentsResult } from '../../api/types';
import { groupSections } from './groupSections';

const item = (id: string, contentType: UnitContentsItem['contentType']): UnitContentsItem => ({
  id,
  contentType,
  contentId: `c-${id}`,
  title: id,
  lessonKind: null,
  durationMinutes: null,
  xpReward: null,
  status: 'available',
  masteryPercent: null,
});

const contents = (
  sections: UnitContentsResult['sections'],
  ungroupedItems: UnitContentsItem[] = [],
): UnitContentsResult => ({ moduleId: 'm', moduleTitle: 'M', sections, ungroupedItems });

describe('groupSections', () => {
  it('keeps a section the server titled', () => {
    const result = groupSections(
      contents([{ id: 's1', title: 'Leksjon 1', items: [item('a', 'exercise'), item('b', 'lesson')] }]),
    );
    expect(result).toEqual([
      { key: 's1', title: 'Leksjon 1', kind: null, data: [item('a', 'exercise'), item('b', 'lesson')] },
    ]);
  });

  it('groups the ungrouped rest by type, texts then words and grammar then exercises', () => {
    const result = groupSections(
      contents([], [
        item('e1', 'exercise'),
        item('g1', 'grammar_rule'),
        item('l1', 'lesson'),
        item('v1', 'vocabulary_list'),
        item('e2', 'exercise'),
      ]),
    );
    expect(result.map(s => [s.kind, s.data.map(i => i.id)])).toEqual([
      ['texts', ['l1']],
      ['wordsGrammar', ['g1', 'v1']],
      ['exercises', ['e1', 'e2']],
    ]);
    expect(result.every(s => s.title === null)).toBe(true);
  });

  it('groups an untitled server section the same way, under its own keys', () => {
    const result = groupSections(
      contents([{ id: 's1', title: ' ', items: [item('e1', 'exercise'), item('l1', 'lesson')] }]),
    );
    expect(result.map(s => s.key)).toEqual(['s1:texts', 's1:exercises']);
  });

  it('puts containers and unknown types under «other», last', () => {
    const result = groupSections(contents([], [item('c1', 'container'), item('l1', 'lesson')]));
    expect(result.map(s => s.kind)).toEqual(['texts', 'other']);
  });

  it('drops empty sections', () => {
    expect(groupSections(contents([{ id: 's1', title: 'Empty', items: [] }]))).toEqual([]);
  });
});
