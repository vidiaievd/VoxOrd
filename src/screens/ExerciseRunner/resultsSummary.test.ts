import { buildResultsSummary } from './resultsSummary';
import type { ItemResult } from './runnerMachine';
import type { SubmitAttemptResponse } from '../../api/exercises';

function verdict(overrides: Partial<SubmitAttemptResponse>): SubmitAttemptResponse {
  return {
    attemptId: 'a',
    correct: false,
    score: null,
    requiresReview: false,
    feedback: { summary: '' },
    ...overrides,
  };
}

function result(overrides: Partial<SubmitAttemptResponse>, timeSpentSeconds = 10): ItemResult {
  return { exerciseId: 'ex', verdict: verdict(overrides), timeSpentSeconds };
}

describe('buildResultsSummary', () => {
  it('returns all-zero for an empty set', () => {
    expect(buildResultsSummary([])).toEqual({
      total: 0,
      correct: 0,
      needsReview: 0,
      incorrect: 0,
      accuracy: 0,
      handledRatio: 0,
      totalTimeSpentSeconds: 0,
    });
  });

  it('buckets correct, needsReview, and incorrect disjointly', () => {
    const results = [
      result({ correct: true, score: 100 }),
      result({ correct: false, requiresReview: true }),
      result({ correct: false, requiresReview: false, score: 0 }),
    ];
    const summary = buildResultsSummary(results);
    expect(summary.total).toBe(3);
    expect(summary.correct).toBe(1);
    expect(summary.needsReview).toBe(1);
    expect(summary.incorrect).toBe(1);
    expect(summary.accuracy).toBeCloseTo(1 / 3);
    expect(summary.handledRatio).toBeCloseTo(2 / 3);
  });

  it('treats an all-review set (e.g. writing_task) as fully handled, not a failure', () => {
    const results = [result({ requiresReview: true }), result({ requiresReview: true })];
    const summary = buildResultsSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.handledRatio).toBe(1);
  });

  it('sums time spent across all items', () => {
    const results = [result({}, 12), result({}, 8)];
    expect(buildResultsSummary(results).totalTimeSpentSeconds).toBe(20);
  });
});
