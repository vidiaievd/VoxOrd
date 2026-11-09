import { buildResultsSummary, formatSetTime } from './resultsSummary';
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

function result(
  overrides: Partial<SubmitAttemptResponse>,
  timeSpentSeconds = 10,
  exerciseId = 'ex',
): ItemResult {
  return { exerciseId, verdict: verdict(overrides), timeSpentSeconds };
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
      reviewIds: [],
      wrongIds: [],
      waitingTeacher: 0,
      waitingAi: 0,
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

describe('buildResultsSummary — rows and waiting', () => {
  it('lists the handed-in and the wrong exercises once each, in set order', () => {
    const summary = buildResultsSummary([
      result({ correct: false }, 5, 'b'),
      result({ correct: false, requiresReview: true }, 5, 'w'),
      result({ correct: false }, 5, 'a'),
      result({ correct: false }, 5, 'b'),
      result({ correct: true }, 5, 'c'),
    ]);
    expect(summary.wrongIds).toEqual(['b', 'a']);
    expect(summary.reviewIds).toEqual(['w']);
  });

  it('splits the waiting work by reviewer and leaves out what nobody will read', () => {
    const summary = buildResultsSummary([
      result({ requiresReview: true, reviewer: 'teacher' }, 5, 'a'),
      result({ requiresReview: true }, 5, 'b'),
      result({ requiresReview: true, reviewer: 'ai' }, 5, 'c'),
      result({ requiresReview: true, reviewer: 'none' }, 5, 'd'),
    ]);
    expect(summary.needsReview).toBe(4);
    expect(summary.waitingTeacher).toBe(2);
    expect(summary.waitingAi).toBe(1);
  });
});

describe('formatSetTime', () => {
  it('reads m:ss', () => {
    expect(formatSetTime(0)).toBe('0:00');
    expect(formatSetTime(9)).toBe('0:09');
    expect(formatSetTime(260)).toBe('4:20');
    expect(formatSetTime(3725)).toBe('62:05');
  });
});
