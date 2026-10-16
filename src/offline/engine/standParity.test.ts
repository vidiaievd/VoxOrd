import cases from './__fixtures__/stand-verdicts.json';
import type { ExerciseKey } from './grading';
import { exerciseFrom, memoryEngine } from './testing';

/**
 * Verdicts the engine gave on the dev stand (15.10.2026) for real seeded documents, with the
 * key `GET /exercises/:id/answers` returned for them. The phone's engine, given the same key
 * and answer, must say what the server's said — the whole promise of working offline.
 */
describe('the local engine agrees with exercise-engine on the stand', () => {
  it.each(cases.map(c => [c.name, c] as const))('%s', async (_name, c) => {
    const { engine } = memoryEngine({ ex: exerciseFrom('ex', c.key as ExerciseKey) });

    const { attemptId } = await engine.start('ex', { language: 'nb', mode: 'PRACTICE' });
    const verdict = await engine.submit(attemptId, {
      submittedAnswer: c.answer,
      timeSpentSeconds: 5,
      locale: 'ru',
    });
    const expected = c.verdict as Record<string, unknown>;

    expect(verdict.correct).toBe(expected.correct);
    expect(verdict.score).toBe(expected.score);
    expect(verdict.requiresReview).toBe(expected.requiresReview);
    expect(verdict.feedback).toEqual(expected.feedback);
    expect(verdict.details ?? null).toEqual(expected.details ?? null);
  });
});
