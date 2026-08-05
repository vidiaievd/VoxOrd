import {
  currentExerciseId,
  initRunnerState,
  isLastExercise,
  runnerReducer,
  type RunnerState,
} from './runnerMachine';
import type { ExerciseDisplay } from '../../api/types';
import type { SubmitAttemptResponse } from '../../api/exercises';

const display = (id: string): ExerciseDisplay => ({
  id,
  templateCode: 'multiple_choice',
  targetLanguage: 'no',
  content: { question: 'q' },
});

const verdict = (correct: boolean): SubmitAttemptResponse => ({
  attemptId: 'att-1',
  correct,
  score: correct ? 100 : 0,
  requiresReview: false,
  feedback: { summary: correct ? 'Correct' : 'Try again' },
});

/** Walk a fresh runner to the 'answering' phase of its current item. */
function toAnswering(ids: string[], startIndex = 0): RunnerState {
  let s = initRunnerState(ids, startIndex);
  s = runnerReducer(s, { type: 'LOAD_SUCCESS', display: display(currentExerciseId(s)!) });
  return s;
}

describe('initRunnerState', () => {
  it('starts loading the first item of a non-empty set', () => {
    const s = initRunnerState(['e1', 'e2'], 0);
    expect(s.phase).toBe('loading');
    expect(s.idx).toBe(0);
    expect(currentExerciseId(s)).toBe('e1');
  });

  it('is immediately complete for an empty set', () => {
    const s = initRunnerState([], 0);
    expect(s.phase).toBe('complete');
  });

  it('clamps an out-of-range start index into the set', () => {
    expect(initRunnerState(['a', 'b', 'c'], 9).idx).toBe(2);
    expect(initRunnerState(['a', 'b', 'c'], -3).idx).toBe(0);
  });
});

describe('load transitions', () => {
  it('loading → answering on LOAD_SUCCESS', () => {
    const s = runnerReducer(initRunnerState(['e1']), {
      type: 'LOAD_SUCCESS',
      display: display('e1'),
    });
    expect(s.phase).toBe('answering');
    expect(s.display?.id).toBe('e1');
  });

  it('loading → loadError on LOAD_FAILURE, and LOAD_START retries', () => {
    let s = runnerReducer(initRunnerState(['e1']), {
      type: 'LOAD_FAILURE',
      message: 'network',
    });
    expect(s.phase).toBe('loadError');
    expect(s.loadError).toBe('network');

    s = runnerReducer(s, { type: 'LOAD_START' });
    expect(s.phase).toBe('loading');
    expect(s.loadError).toBeNull();
  });

  it('ignores LOAD_SUCCESS when not loading (stale response after advance)', () => {
    const answering = toAnswering(['e1']);
    const s = runnerReducer(answering, { type: 'LOAD_SUCCESS', display: display('other') });
    expect(s).toBe(answering);
  });
});

describe('answer + check transitions', () => {
  it('records the answer and submittability while answering', () => {
    const s = runnerReducer(toAnswering(['e1']), {
      type: 'ANSWER_CHANGE',
      answer: { selectedId: 'opt-2' },
      canSubmit: true,
    });
    expect(s.answer).toEqual({ selectedId: 'opt-2' });
    expect(s.canSubmit).toBe(true);
  });

  it('does not enter checking when nothing is submittable', () => {
    const s = runnerReducer(toAnswering(['e1']), { type: 'CHECK_START' });
    expect(s.phase).toBe('answering');
  });

  it('answering → checking → feedback on a successful submit', () => {
    let s = runnerReducer(toAnswering(['e1']), {
      type: 'ANSWER_CHANGE',
      answer: { selectedId: 'opt-2' },
      canSubmit: true,
    });
    s = runnerReducer(s, { type: 'CHECK_START' });
    expect(s.phase).toBe('checking');

    s = runnerReducer(s, { type: 'CHECK_SUCCESS', verdict: verdict(true), timeSpentSeconds: 5 });
    expect(s.phase).toBe('feedback');
    expect(s.verdict?.correct).toBe(true);
    expect(s.results).toEqual([{ exerciseId: 'e1', verdict: verdict(true), timeSpentSeconds: 5 }]);
  });

  it('a second CHECK_START while checking is a no-op (single-shot submit)', () => {
    let s = runnerReducer(toAnswering(['e1']), {
      type: 'ANSWER_CHANGE',
      answer: 'x',
      canSubmit: true,
    });
    s = runnerReducer(s, { type: 'CHECK_START' });
    const checking = s;
    s = runnerReducer(s, { type: 'CHECK_START' });
    expect(s).toBe(checking);
  });

  it('CHECK_FAILURE returns to answering, keeps the answer, surfaces the error', () => {
    let s = runnerReducer(toAnswering(['e1']), {
      type: 'ANSWER_CHANGE',
      answer: 'keep-me',
      canSubmit: true,
    });
    s = runnerReducer(s, { type: 'CHECK_START' });
    s = runnerReducer(s, { type: 'CHECK_FAILURE', message: 'offline' });
    expect(s.phase).toBe('answering');
    expect(s.answer).toBe('keep-me');
    expect(s.canSubmit).toBe(true);
    expect(s.submitError).toBe('offline');
  });

  it('editing the answer clears a stale submit error', () => {
    let s = runnerReducer(toAnswering(['e1']), {
      type: 'ANSWER_CHANGE',
      answer: 'a',
      canSubmit: true,
    });
    s = runnerReducer(s, { type: 'CHECK_START' });
    s = runnerReducer(s, { type: 'CHECK_FAILURE', message: 'offline' });
    s = runnerReducer(s, { type: 'ANSWER_CHANGE', answer: 'b', canSubmit: true });
    expect(s.submitError).toBeNull();
  });
});

describe('advance transitions', () => {
  it('advances to the next item and resets per-item state', () => {
    let s = toAnswering(['e1', 'e2'], 0);
    s = runnerReducer(s, { type: 'ANSWER_CHANGE', answer: 'a', canSubmit: true });
    s = runnerReducer(s, { type: 'CHECK_START' });
    s = runnerReducer(s, { type: 'CHECK_SUCCESS', verdict: verdict(true), timeSpentSeconds: 3 });
    s = runnerReducer(s, { type: 'ADVANCE' });

    expect(s.idx).toBe(1);
    expect(s.phase).toBe('loading');
    expect(currentExerciseId(s)).toBe('e2');
    expect(s.display).toBeNull();
    expect(s.answer).toBeNull();
    expect(s.canSubmit).toBe(false);
    expect(s.verdict).toBeNull();
    expect(s.results).toHaveLength(1);
  });

  it('completes the set after advancing past the last item', () => {
    let s = toAnswering(['only'], 0);
    s = runnerReducer(s, { type: 'ANSWER_CHANGE', answer: 'a', canSubmit: true });
    s = runnerReducer(s, { type: 'CHECK_START' });
    s = runnerReducer(s, { type: 'CHECK_SUCCESS', verdict: verdict(false), timeSpentSeconds: 8 });
    expect(isLastExercise(s)).toBe(true);

    s = runnerReducer(s, { type: 'ADVANCE' });
    expect(s.phase).toBe('complete');
    expect(s.results).toEqual([{ exerciseId: 'only', verdict: verdict(false), timeSpentSeconds: 8 }]);
  });

  it('ignores ADVANCE outside the feedback phase', () => {
    const answering = toAnswering(['e1', 'e2']);
    expect(runnerReducer(answering, { type: 'ADVANCE' })).toBe(answering);
  });
});
