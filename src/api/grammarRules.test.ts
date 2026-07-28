import { getGrammarRuleExplanation, getGrammarRulePoolExerciseIds } from './grammarRules';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

describe('getGrammarRuleExplanation', () => {
  beforeEach(() => mockGet.mockReset());

  it('calls the best-explanation endpoint with lang/level query params', async () => {
    mockGet.mockResolvedValue({
      explanation: {
        id: 'expl-1',
        grammarRuleId: 'rule-1',
        displayTitle: 'Presens og preteritum',
        displaySummary: 'Present and past tense',
        bodyMarkdown: '# Presens\n\nBruk presens for...',
        estimatedReadingMinutes: 5,
      },
      fallbackUsed: false,
    });

    const result = await getGrammarRuleExplanation('rule-1', {
      studentNativeLanguage: 'ru',
      studentCurrentLevel: 'A2',
    });

    expect(mockGet).toHaveBeenCalledWith('/api/v1/grammar-rules/rule-1/explanations/best', {
      query: { lang: 'ru', level: 'A2' },
    });
    expect(result).toEqual({
      id: 'expl-1',
      grammarRuleId: 'rule-1',
      displayTitle: 'Presens og preteritum',
      displaySummary: 'Present and past tense',
      bodyMarkdown: '# Presens\n\nBruk presens for...',
      estimatedReadingMinutes: 5,
    });
  });

  it('unwraps the explanation, dropping fallbackUsed', async () => {
    mockGet.mockResolvedValue({
      explanation: {
        id: 'expl-2',
        grammarRuleId: 'rule-2',
        displayTitle: 'Adjektiv',
        displaySummary: null,
        bodyMarkdown: '# Adjektiv',
        estimatedReadingMinutes: null,
      },
      fallbackUsed: true,
    });

    const result = await getGrammarRuleExplanation('rule-2', {
      studentNativeLanguage: 'en',
      studentCurrentLevel: 'B1',
    });

    expect(result).not.toHaveProperty('fallbackUsed');
    expect(result.displaySummary).toBeNull();
  });
});

describe('getGrammarRulePoolExerciseIds', () => {
  beforeEach(() => mockGet.mockReset());

  it('calls the pool endpoint with limit/sort and maps out exercise ids in order', async () => {
    mockGet.mockResolvedValue({
      items: [
        { exerciseId: 'ex-1', position: 0 },
        { exerciseId: 'ex-2', position: 1 },
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
    });

    const result = await getGrammarRulePoolExerciseIds('rule-1');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/grammar-rules/rule-1/pool', {
      query: { limit: 50, sort: 'position_asc' },
    });
    expect(result).toEqual(['ex-1', 'ex-2']);
  });

  it('returns an empty array for a rule with no pool entries', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });

    const result = await getGrammarRulePoolExerciseIds('rule-2');

    expect(result).toEqual([]);
  });
});
