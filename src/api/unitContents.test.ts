import { getUnitContents } from './unitContents';
import { apiClient } from './client';
import { getGrammarRuleMastery } from './mastery';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));
jest.mock('./mastery', () => ({
  getGrammarRuleMastery: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;
const mockGetGrammarRuleMastery = getGrammarRuleMastery as jest.Mock;

/**
 * The wire payload as learning-service actually serializes it: `contentType`
 * is the service's internal UPPERCASE ContentType, not content-service's
 * lowercase ContainerItemType.
 */
function wirePayload() {
  return {
    moduleId: 'unit-1',
    moduleTitle: 'Leksjon 1',
    sections: [
      {
        id: 'sec-1',
        title: 'Tekst',
        items: [
          {
            id: 'item-1',
            contentType: 'LESSON',
            contentId: 'lesson-1',
            title: 'Hei!',
            lessonKind: 'text',
            durationMinutes: 10,
            xpReward: 10,
            status: 'available',
          },
          {
            id: 'item-2',
            contentType: 'VOCABULARY_LIST',
            contentId: 'vocab-1',
            title: 'Nye ord',
            lessonKind: null,
            durationMinutes: null,
            xpReward: null,
            status: 'available',
          },
        ],
      },
    ],
    ungroupedItems: [
      {
        id: 'item-3',
        contentType: 'EXERCISE',
        contentId: 'ex-1',
        title: 'Oppgave',
        lessonKind: null,
        durationMinutes: null,
        xpReward: 5,
        status: 'available',
      },
    ],
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGetGrammarRuleMastery.mockReset();
});

describe('getUnitContents', () => {
  it('calls the learning-service unit contents endpoint', async () => {
    mockGet.mockResolvedValue(wirePayload());

    await getUnitContents('unit-1');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/progress/units/unit-1/contents');
  });

  it('normalizes uppercase wire contentType to the lowercase UI form', async () => {
    mockGet.mockResolvedValue(wirePayload());

    const result = await getUnitContents('unit-1');

    expect(result.sections[0].items.map((i) => i.contentType)).toEqual([
      'lesson',
      'vocabulary_list',
    ]);
    expect(result.ungroupedItems[0].contentType).toBe('exercise');
  });

  it('preserves every other field untouched', async () => {
    mockGet.mockResolvedValue(wirePayload());

    const result = await getUnitContents('unit-1');

    expect(result.moduleId).toBe('unit-1');
    expect(result.moduleTitle).toBe('Leksjon 1');
    expect(result.sections[0]).toMatchObject({ id: 'sec-1', title: 'Tekst' });
    expect(result.sections[0].items[0]).toMatchObject({
      id: 'item-1',
      contentId: 'lesson-1',
      title: 'Hei!',
      lessonKind: 'text',
      durationMinutes: 10,
      xpReward: 10,
      status: 'available',
    });
  });

  it('attaches mastery percent to grammar_rule items only', async () => {
    mockGet.mockResolvedValue({
      moduleId: 'unit-1',
      moduleTitle: 'Leksjon 1',
      sections: [
        {
          id: 'sec-1',
          title: 'Grammatikk',
          items: [
            {
              id: 'item-4',
              contentType: 'GRAMMAR_RULE',
              contentId: 'rule-1',
              title: 'Bestemt form',
              lessonKind: null,
              durationMinutes: null,
              xpReward: null,
              status: 'available',
            },
            {
              id: 'item-1',
              contentType: 'LESSON',
              contentId: 'lesson-1',
              title: 'Hei!',
              lessonKind: 'text',
              durationMinutes: 10,
              xpReward: 10,
              status: 'available',
            },
          ],
        },
      ],
      ungroupedItems: [],
    });
    mockGetGrammarRuleMastery.mockResolvedValue({
      grammarRuleId: 'rule-1',
      masteryPercent: 62,
      status: 'LEARNING',
    });

    const result = await getUnitContents('unit-1');

    expect(mockGetGrammarRuleMastery).toHaveBeenCalledWith('rule-1');
    expect(mockGetGrammarRuleMastery).toHaveBeenCalledTimes(1);
    expect(result.sections[0].items[0].masteryPercent).toBe(62);
    expect(result.sections[0].items[1].masteryPercent).toBeNull();
  });

  it('leaves masteryPercent null when the mastery fetch fails, without throwing', async () => {
    mockGet.mockResolvedValue({
      moduleId: 'unit-1',
      moduleTitle: 'Leksjon 1',
      sections: [],
      ungroupedItems: [
        {
          id: 'item-4',
          contentType: 'GRAMMAR_RULE',
          contentId: 'rule-1',
          title: 'Bestemt form',
          lessonKind: null,
          durationMinutes: null,
          xpReward: null,
          status: 'available',
        },
      ],
    });
    mockGetGrammarRuleMastery.mockRejectedValue(new Error('network error'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getUnitContents('unit-1');

    expect(result.ungroupedItems[0].masteryPercent).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles a unit with no sections or ungrouped items', async () => {
    mockGet.mockResolvedValue({
      moduleId: 'unit-2',
      moduleTitle: null,
      sections: [],
      ungroupedItems: [],
    });

    const result = await getUnitContents('unit-2');

    expect(result.sections).toEqual([]);
    expect(result.ungroupedItems).toEqual([]);
  });
});
