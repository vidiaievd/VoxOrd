import { buildResultsSummary, formatSetTime, toneOf } from './resultsSummary';
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
      accuracy: null,
      tone: 'HandedIn',
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
    // The handed-in item is neither right nor wrong: 1 of the 2 checked on the spot.
    expect(summary.accuracy).toBeCloseTo(1 / 2);
    expect(summary.tone).toBe('Okay');
  });

  it('calls an all-review set (e.g. writing_task) handed in — neither a failure nor «Excellent»', () => {
    const results = [result({ requiresReview: true }), result({ requiresReview: true })];
    const summary = buildResultsSummary(results);
    expect(summary.accuracy).toBeNull();
    expect(summary.tone).toBe('HandedIn');
    expect(summary.correct).toBe(0);
  });

  it('does not count work waiting for a teacher as passed (OQ-110)', () => {
    // An essay the model provisionally sent back, still with the teacher: not «1 of 1».
    const summary = buildResultsSummary([
      result({ requiresReview: true, reviewer: 'teacher', aiFirst: true }, 5, 'essay'),
    ]);
    expect(summary.correct).toBe(0);
    expect(summary.needsReview).toBe(1);
    expect(summary.tone).toBe('HandedIn');
  });

  it('titles a mixed set by what was checked on the spot only', () => {
    const summary = buildResultsSummary([
      result({ correct: true, score: 100 }, 5, 'mc'),
      result({ requiresReview: true, reviewer: 'teacher' }, 5, 'essay'),
    ]);
    expect(summary.correct).toBe(1);
    expect(summary.tone).toBe('Excellent');
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

describe('toneOf', () => {
  it('steps by the share right', () => {
    expect(toneOf(1)).toBe('Excellent');
    expect(toneOf(0.75)).toBe('Good');
    expect(toneOf(0.5)).toBe('Okay');
    expect(toneOf(0.2)).toBe('KeepGoing');
    expect(toneOf(null)).toBe('HandedIn');
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

describe('a set that passed with an item wrong (plan 90, OQ-S3 s11)', () => {
  it('counts as right, not «with a mistake»', () => {
    const summary = buildResultsSummary([result({ correct: false, score: 75, passed: true }, 10, 'mc')]);
    expect(summary.correct).toBe(1);
    expect(summary.incorrect).toBe(0);
    expect(summary.wrongIds).toEqual([]);
  });

  it('a failed one still counts as wrong', () => {
    const summary = buildResultsSummary([result({ correct: false, score: 50, passed: false }, 10, 'mc')]);
    expect(summary.incorrect).toBe(1);
  });
});
