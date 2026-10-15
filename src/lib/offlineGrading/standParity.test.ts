import { gradeOffline, type ExerciseKey } from './index';
import cases from './__fixtures__/stand-verdicts.json';

/**
 * Verdicts the engine gave on the dev stand (15.10.2026) for real seeded documents, with the
 * key `GET /exercises/:id/answers` returned for them. The phone, given the same key and
 * answer, must say what the engine said — the whole promise of grading offline.
 */
describe('offline grading agrees with the engine on the stand', () => {
  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const verdict = gradeOffline(
      c.key as ExerciseKey,
      c.templateCode,
      c.answer,
      'ru',
      'offline:x',
    );
    const expected = c.verdict as Record<string, unknown>;

    expect(verdict.correct).toBe(expected.correct);
    expect(verdict.score).toBe(expected.score);
    expect(verdict.requiresReview).toBe(expected.requiresReview);
    expect(verdict.feedback.summary).toBe((expected.feedback as { summary: string }).summary);
    const feedback = expected.feedback as { correctAnswer?: unknown };
    expect(verdict.feedback.correctAnswer).toEqual(feedback.correctAnswer);
    expect(verdict.details ?? null).toEqual(expected.details ?? null);
  });
});
