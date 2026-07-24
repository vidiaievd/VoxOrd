import { buildLessonCompletionRequest } from './progress';

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
