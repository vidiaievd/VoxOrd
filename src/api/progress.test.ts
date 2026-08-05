import { buildExerciseCompletionRequest, buildLessonCompletionRequest } from './progress';
import type { SubmitAttemptResponse } from './exercises';

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

describe('buildLessonCompletionRequest', () => {
  it('sends the uppercase LESSON content type and the lesson id', () => {
    const request = buildLessonCompletionRequest('lesson-1', 0, 0);
    expect(request.contentType).toBe('LESSON');
    expect(request.contentId).toBe('lesson-1');
    expect(request.completed).toBe(true);
    expect(request.score).toBeUndefined();
  });

  it('computes timeSpentSeconds as the rounded elapsed time', () => {
    const startedAt = 1_000;
    const now = 1_000 + 42_600; // 42.6s later
    const request = buildLessonCompletionRequest('lesson-1', startedAt, now);
    expect(request.timeSpentSeconds).toBe(43);
  });

  it('never returns a negative timeSpentSeconds if the clock looks off', () => {
    const request = buildLessonCompletionRequest('lesson-1', 10_000, 1_000);
    expect(request.timeSpentSeconds).toBe(0);
  });

  it('defaults to Date.now() when nowMs is omitted', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    try {
      const request = buildLessonCompletionRequest('lesson-1', 4_000);
      expect(request.timeSpentSeconds).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('buildExerciseCompletionRequest', () => {
  it('sends the uppercase EXERCISE content type, the exercise id, and completed:true', () => {
    const request = buildExerciseCompletionRequest('ex-1', verdict({ score: 100 }), 12);
    expect(request.contentType).toBe('EXERCISE');
    expect(request.contentId).toBe('ex-1');
    expect(request.completed).toBe(true);
    expect(request.timeSpentSeconds).toBe(12);
  });

  it('passes the server score through unchanged', () => {
    const request = buildExerciseCompletionRequest('ex-1', verdict({ score: 75 }), 5);
    expect(request.score).toBe(75);
  });

  it('omits score when the verdict has none (still-pending free-form review)', () => {
    const request = buildExerciseCompletionRequest('ex-1', verdict({ score: null }), 5);
    expect(request.score).toBeUndefined();
  });
});
