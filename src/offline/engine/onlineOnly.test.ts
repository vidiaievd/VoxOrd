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
