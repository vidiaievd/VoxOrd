import { apiClient } from './client';
import { getDueGrammarRules, getGrammarRuleReview } from './grammarReview';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

const state = {
  grammarRuleId: 'rule-1',
  poolSize: 6,
  introducedCount: 4,
  averageRetrievability: 0.434,
  lastPracticedAt: '2026-10-18T10:00:00.000Z',
  strugglingCount: 2,
  dueReasons: ['stale', 'mistakes'],
};

describe('grammar review api', () => {
  beforeEach(() => mockGet.mockReset());

  it('reads the due rules of a course with mastery as a percent', async () => {
    mockGet.mockResolvedValue({ courseId: 'course-1', rules: [{ ...state, moduleId: 'unit-1' }] });

    const rules = await getDueGrammarRules('course-1');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/mastery/grammar-rules/due', {
      query: { courseId: 'course-1' },
    });
    expect(rules).toEqual([
      {
        grammarRuleId: 'rule-1',
        poolSize: 6,
        masteryPercent: 43,
        lastPracticedAt: '2026-10-18T10:00:00.000Z',
        strugglingCount: 2,
        dueReasons: ['stale', 'mistakes'],
        moduleId: 'unit-1',
      },
    ]);
  });

  it("reads one rule's review pool", async () => {
    mockGet.mockResolvedValue({ ...state, reviewPool: ['e2', 'e1'] });

    const review = await getGrammarRuleReview('rule-1');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/mastery/grammar-rules/rule-1/review');
    expect(review.reviewPool).toEqual(['e2', 'e1']);
    expect(review.masteryPercent).toBe(43);
  });
});
