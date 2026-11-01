import { parsePrecheckResult } from '../../../api/precheck';
import {
  accuracyBand,
  checksLeft,
  mayAskAgain,
  noticeOf,
  precheckCapable,
  rulesToRevisit,
  wordsByPassage,
} from './precheck';

const base = { attemptId: 'a', templateCode: 'writing_task', selfCheck: null, feedback: null, reading: null };

describe('precheckCapable', () => {
  it('offers the five templates of Q3 and nothing that is checked on the spot', () => {
    for (const code of ['translate_to_target', 'translate_from_target', 'error_correction', 'writing_task', 'short_answer']) {
      expect(precheckCapable(code)).toBe(true);
    }
    for (const code of ['multiple_choice', 'fill_in_blank', 'match_pairs', 'dictation', 'text_order']) {
      expect(precheckCapable(code)).toBe(false);
    }
  });

  it('rehearses read_aloud only when it is read from a text', () => {
    expect(precheckCapable('read_aloud', 'read')).toBe(true);
    expect(precheckCapable('read_aloud', 'monologue')).toBe(false);
    expect(precheckCapable('read_aloud')).toBe(false);
  });
});

describe('parsePrecheckResult', () => {
  it('reads remarks field by field and keeps nothing upstream added', () => {
    const result = parsePrecheckResult({
      ...base,
      ai: { status: 'ok' },
      feedback: {
        summary: 'Good start.',
        items: [
          { kind: 'grammar', target: {}, original: 'jeg har gå', suggestion: 'jeg har gått', explanation: 'Perfektum.', atomRef: null, severity: 'major', extra: 1 },
          { kind: 'nonsense', explanation: 'dropped' },
        ],
        words: [{ text: 'Hei', passageIndex: 0, accuracy: 91, startMs: 0 }, { text: 'du' }],
      },
      remaining: { exercise: 2, learnerCredits: '4.25', learnerChecksApprox: 17 },
    });
    expect(result?.ai).toEqual({ status: 'ok' });
    expect(result?.feedback?.items).toEqual([
      { kind: 'grammar', original: 'jeg har gå', suggestion: 'jeg har gått', explanation: 'Perfektum.', severity: 'major', atom: null },
    ]);
    expect(result?.feedback?.words).toEqual([
      { text: 'Hei', passageIndex: 0, accuracy: 91 },
      { text: 'du', passageIndex: null, accuracy: null },
    ]);
    expect(result?.remaining).toEqual({ exercise: 2, learnerChecksApprox: 17 });
  });

  it('draws no remarks unless the model answered', () => {
    const result = parsePrecheckResult({
      ...base,
      ai: { status: 'refused', reason: 'exercise_limit', detail: null },
      feedback: { summary: 'ignored', items: [] },
      remaining: { exercise: 0, learnerCredits: null, learnerChecksApprox: null },
    });
    expect(result?.feedback).toBeNull();
  });

  it('is null for an answer it cannot read', () => {
    expect(parsePrecheckResult(null)).toBeNull();
    expect(parsePrecheckResult({ ...base, ai: { status: 'weird' } })).toBeNull();
    expect(parsePrecheckResult({ ...base })).toBeNull();
  });
});

describe('noticeOf', () => {
  const of = (ai: unknown, extra: object = {}) => {
    const result = parsePrecheckResult({ ...base, ai, ...extra });
    if (result === null) throw new Error('unreadable');
    return noticeOf(result);
  };

  it('shows remarks when the model answered', () => {
    expect(of({ status: 'ok' }, { feedback: { summary: 's', items: [] } })).toEqual({ kind: 'remarks' });
  });

  it('turns each refusal into its own line', () => {
    expect(of({ status: 'refused', reason: 'exercise_limit' })).toEqual({ kind: 'line', key: 'exerciseLimit' });
    expect(of({ status: 'refused', reason: 'learner_limit' })).toEqual({ kind: 'line', key: 'learnerLimit' });
    expect(of({ status: 'refused', reason: 'pool_empty' })).toEqual({ kind: 'line', key: 'poolEmpty' });
    expect(of({ status: 'refused', reason: 'unaskable' })).toEqual({ kind: 'line', key: 'emptyAnswer' });
  });

  it('says a recording is not ready, and anything else that failed is just a failure', () => {
    expect(of({ status: 'failed', errorCode: 'recording_not_ready' })).toEqual({ kind: 'line', key: 'notReady' });
    expect(of({ status: 'failed', errorCode: 'timeout' })).toEqual({ kind: 'line', key: 'failed' });
  });

  it('keeps quiet where the free half ran and no model is for this learner', () => {
    expect(of({ status: 'not_asked', reason: 'key_settles' })).toEqual({ kind: 'line', key: 'keySettles' });
    expect(of({ status: 'not_asked', reason: 'disabled' })).toEqual({ kind: 'none' });
  });
});

describe('checks left', () => {
  it('goes by the smaller limit, and promises nothing without one', () => {
    expect(checksLeft({ exercise: 3, learnerChecksApprox: 17 })).toBe(3);
    expect(checksLeft({ exercise: null, learnerChecksApprox: 17 })).toBe(17);
    expect(checksLeft({ exercise: null, learnerChecksApprox: null })).toBeNull();
    expect(checksLeft(null)).toBeNull();
  });

  it('allows another check unless this exercise is known to be spent', () => {
    expect(mayAskAgain(null)).toBe(true);
    expect(mayAskAgain({ exercise: null, learnerChecksApprox: 0 })).toBe(true);
    expect(mayAskAgain({ exercise: 1, learnerChecksApprox: null })).toBe(true);
    expect(mayAskAgain({ exercise: 0, learnerChecksApprox: null })).toBe(false);
  });
});

describe('words', () => {
  it('bands scores', () => {
    expect(accuracyBand(95)).toBe('good');
    expect(accuracyBand(80)).toBe('good');
    expect(accuracyBand(79)).toBe('fair');
    expect(accuracyBand(50)).toBe('fair');
    expect(accuracyBand(49)).toBe('low');
  });

  it('groups the words heard by passage, in the order heard', () => {
    const groups = wordsByPassage({
      summary: '',
      items: [],
      words: [
        { text: 'a', passageIndex: 0, accuracy: null },
        { text: 'b', passageIndex: 0, accuracy: null },
        { text: 'c', passageIndex: 2, accuracy: null },
      ],
    });
    expect(groups.map((g) => [g.passageIndex, g.words.map((w) => w.text)])).toEqual([
      [0, ['a', 'b']],
      [2, ['c']],
    ]);
  });
});

describe('rule atoms of remarks (plan 85, step 7)', () => {
  const atomRef = (atomId: string, status: string) => ({
    atomType: 'grammar_rule_atom', atomId, status, ruleTitle: 'Inversjon', title: 'V2',
  });
  const item = (atomRef: unknown) => ({ kind: 'grammar', target: {}, explanation: 'x', severity: 'minor', atomRef });

  it('reads an atom only when all of it is readable', () => {
    const result = parsePrecheckResult({
      ...base,
      ai: { status: 'ok' },
      courseId: 'c-1',
      feedback: {
        summary: 's',
        items: [item(atomRef('a1', 'in_queue')), item({ atomType: 'grammar_rule_atom', atomId: 'a2' }), item(atomRef('a3', 'weird'))],
      },
    });
    expect(result?.courseId).toBe('c-1');
    expect(result?.feedback?.items.map((i) => i.atom)).toEqual([
      { atomId: 'a1', status: 'in_queue', ruleTitle: 'Inversjon', title: 'V2' },
      null,
      null,
    ]);
  });

  it('lists each rule once, in the order first named', () => {
    const result = parsePrecheckResult({
      ...base,
      ai: { status: 'ok' },
      feedback: { summary: 's', items: [item(atomRef('b', 'covered')), item(null), item(atomRef('a', 'in_queue')), item(atomRef('b', 'covered'))] },
    });
    expect(rulesToRevisit(result!.feedback!).map((r) => r.atomId)).toEqual(['b', 'a']);
  });
});
