import { getCourseMastery, getGrammarRuleMastery } from './mastery';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

describe('getCourseMastery', () => {
  beforeEach(() => mockGet.mockReset());

  it('maps 0..1 fractions to 0..100 percents keyed by skill id', async () => {
    mockGet.mockResolvedValue({
      containerId: 'course-1',
      vocab: 0.8,
      grammar: 0.6,
      reading: 0.5,
      listening: 0.7,
      spoken: 0.3,
      written: 0.2,
      overall: 0.55,
    });

    const result = await getCourseMastery('course-1');

    expect(result).toEqual({
      courseId: 'course-1',
      overallMastery: 55,
      bySkill: [
        { skill: 'vocabulary', masteryPercent: 80 },
        { skill: 'grammar', masteryPercent: 60 },
        { skill: 'reading', masteryPercent: 50 },
        { skill: 'listening', masteryPercent: 70 },
        { skill: 'speaking', masteryPercent: 30 },
        { skill: 'writing', masteryPercent: 20 },
      ],
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/mastery/course/course-1');
  });

  it('rounds fractional percents', async () => {
    mockGet.mockResolvedValue({
      containerId: 'course-1',
      vocab: 0.333,
      grammar: 0,
      reading: 0,
      listening: 0,
      spoken: 0,
      written: 0,
      overall: 0.666,
    });

    const result = await getCourseMastery('course-1');

    expect(result.overallMastery).toBe(67);
    expect(result.bySkill[0].masteryPercent).toBe(33);
  });
});

describe('getGrammarRuleMastery', () => {
  beforeEach(() => mockGet.mockReset());

  it('maps averageRetrievability fraction to a rounded percent', async () => {
    mockGet.mockResolvedValue({
      grammarRuleId: 'rule-1',
      poolSize: 10,
      introducedCount: 6,
      averageRetrievability: 0.734,
      masteredCount: 3,
      status: 'LEARNING',
    });

    const result = await getGrammarRuleMastery('rule-1');

    expect(result).toEqual({
      grammarRuleId: 'rule-1',
      masteryPercent: 73,
      status: 'LEARNING',
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/mastery/grammar-rules/rule-1');
  });

  it('reports NOT_STARTED with 0% when the pool has no SRS cards yet', async () => {
    mockGet.mockResolvedValue({
      grammarRuleId: 'rule-2',
      poolSize: 4,
      introducedCount: 0,
      averageRetrievability: 0,
      masteredCount: 0,
      status: 'NOT_STARTED',
    });

    const result = await getGrammarRuleMastery('rule-2');

    expect(result.masteryPercent).toBe(0);
    expect(result.status).toBe('NOT_STARTED');
  });
});
