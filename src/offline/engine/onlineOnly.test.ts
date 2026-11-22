import cases from './__fixtures__/stand-verdicts.json';
import type { ExerciseKey } from './grading';
import { exerciseFrom, memoryEngine } from './testing';

/**
 * Graded work and assignments stay online (offline plan, B7.3). The replay of a local attempt
 * is a PRACTICE attempt, so a graded one made here would reach the SRS and the teacher's
 * results as practice — the start is refused instead, as for a template not graded offline.
 */
describe('the local engine keeps graded work online', () => {
  const { engine } = memoryEngine({ ex: exerciseFrom('ex', cases[0].key as ExerciseKey) });

  it('refuses a GRADED start', async () => {
    await expect(engine.start('ex', { language: 'nb', mode: 'GRADED' })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('refuses a start for an assignment', async () => {
    await expect(
      engine.start('ex', { language: 'nb', assignmentId: 'asg-1' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('still starts practice', async () => {
    await expect(engine.start('ex', { language: 'nb', mode: 'PRACTICE' })).resolves.toMatchObject({
      attemptId: expect.stringMatching(/^offline:/),
    });
  });
});

/**
 * The attempt keeps the exercise's school, so the outbox can tell a 404 after a purge from an
 * exercise its author removed (plan 90, live check s22, finding 6).
 */
describe('the local engine keeps the exercise school on the attempt', () => {
  it('copies ownerSchoolId from the kept display', async () => {
    const ex = exerciseFrom('ex', cases[0].key as ExerciseKey);
    const { engine, attempts } = memoryEngine({ ex: { ...ex, display: { ...ex.display, ownerSchoolId: 'school-1' } } });
    const { attemptId } = (await engine.start('ex', { language: 'nb', mode: 'PRACTICE' })) as { attemptId: string };
    expect(attempts.get(attemptId)?.ownerSchoolId).toBe('school-1');
  });
});
