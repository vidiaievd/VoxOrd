import scenarios from './__fixtures__/stand-scenarios.json';
import { LocalRefusal } from './attempt';
import type { JournalOp } from './engine';
import type { ExerciseKey } from './grading';
import { exerciseFrom, memoryEngine } from './testing';

/**
 * Chains of attempt calls run on the dev stand (15.10.2026) against real seeded documents —
 * checks, re-checks, reveals, refusals — with every reply the engine gave. The phone's engine,
 * given the same key and the same calls, must give the same replies in the same order: that is
 * what lets an attempt worked offline be replayed to the server without the learner having been
 * shown anything the server would not have shown.
 *
 * The attempt id and the clock differ by nature and are masked on both sides.
 */
function masked(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value ?? null)
      .replace(/"attemptId":"[^"]*"/g, '"attemptId":"A"')
      .replace(/"lastCheckAt":\d+/g, '"lastCheckAt":0'),
  );
}

async function perform(
  engine: ReturnType<typeof memoryEngine>['engine'],
  attemptId: string,
  op: JournalOp,
): Promise<unknown> {
  switch (op.op) {
    case 'submit':
      return engine.submit(attemptId, op.body);
    case 'answer':
      return engine.answerQuestion(attemptId, op.body);
    case 'checkRow':
      return engine.checkRow(attemptId, op.body);
    case 'reveal':
      return engine.revealAnswers(attemptId);
    case 'selfCheck':
      return engine.selfCheck(attemptId, op.draftAnswer);
    case 'draft':
      return engine.saveDraft(attemptId, op.draftAnswer);
  }
}

describe('the local engine replies as exercise-engine did on the stand', () => {
  it.each(scenarios.map(s => [s.name, s] as const))('%s', async (_name, s) => {
    const { engine, advance, journal } = memoryEngine({
      ex: exerciseFrom('ex', s.key as ExerciseKey, s.projection as Record<string, unknown>),
    });
    const { attemptId } = await engine.start('ex', { language: 'nb', mode: 'PRACTICE' });

    for (const [i, op] of (s.ops as Array<JournalOp & { delayMs?: number }>).entries()) {
      // The pause the recording made before this call — `dictation` throttles re-checks.
      advance(op.delayMs ?? 0);
      const expected = s.responses[i] as { status: number; body: { message?: string } };
      let status = 200;
      let body: unknown;
      try {
        body = await perform(engine, attemptId, op);
      } catch (e) {
        if (!(e instanceof LocalRefusal)) throw e;
        status = e.status;
        body = { message: e.message };
      }
      expect({ step: i, status, body: masked(body) }).toEqual({
        step: i,
        status: expected.status,
        body: masked(expected.body),
      });
    }

    // The journal is what the server will be sent: exactly the calls that went through, in
    // order — so replaying it is replaying this recording without its refusals.
    const accepted = (s.ops as JournalOp[]).filter((_op, i) => s.responses[i].status < 300);
    expect(journal.map(entry => entry.op)).toEqual(
      accepted.map(op => {
        const rest: Record<string, unknown> = { ...op };
        delete rest.delayMs;
        return rest;
      }),
    );
  });
});
