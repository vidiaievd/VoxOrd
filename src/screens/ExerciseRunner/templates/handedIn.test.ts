import type { AttemptRow } from '../../../api/exercises';
import { isPassedVerdict } from '../../../lib/mistakes';
import {
  againAllowed,
  correctedSentence,
  handedInAttempt,
  handedInLines,
  handedInState,
  handedInVerdictOf,
} from './handedIn';

const row = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: 'a1',
  status: 'ROUTED_FOR_REVIEW',
  templateCode: 'writing_task',
  submittedAnswer: { text: 'Hei, jeg skriver om lekkasjen.', ticked: [] },
  draftAnswer: null,
  schoolId: 'school-1',
  ...over,
});

const writing = (revision?: string): unknown => ({
  mode: 'letter',
  instruction: 'Skriv et brev.',
  prompt: 'Skriv til utleieren.',
  points: [{ id: 'p1', text: 'Beskriv problemet', required: true }],
  phrases: [],
  rubricMax: 15,
  settings: revision === undefined ? {} : { revision },
});

describe('handedInAttempt', () => {
  it('reopens the newest hand-in, past an attempt opened since', () => {
    const rows = [
      row({ id: 'open', status: 'IN_PROGRESS' }),
      row({ id: 'sent', status: 'ROUTED_FOR_REVIEW' }),
      row({ id: 'older', status: 'SCORED' }),
    ];
    expect(handedInAttempt('writing_task', rows)?.id).toBe('sent');
  });

  it('skips abandoned attempts and finds none in a history without a hand-in', () => {
    expect(handedInAttempt('writing_task', [row({ status: 'ABANDONED' }), row({ status: 'IN_PROGRESS' })])).toBeNull();
    expect(handedInAttempt('writing_task', [])).toBeNull();
  });

  it('leaves templates checked on the spot alone', () => {
    expect(handedInAttempt('multiple_choice', [row({ templateCode: 'multiple_choice', status: 'SCORED' })])).toBeNull();
    expect(handedInAttempt('read_aloud', [row({ templateCode: 'read_aloud' })])).toBeNull();
  });

  it('reopens every finished error_correction, an outright approval too', () => {
    const rows = [row({ templateCode: 'error_correction', status: 'SCORED', reviewedBy: null })];
    expect(handedInAttempt('error_correction', rows)?.id).toBe('a1');
  });

  it('reopens a short_answer set only when it went to a reader', () => {
    const onTheSpot = row({ templateCode: 'short_answer', status: 'SCORED', reviewedBy: null });
    expect(handedInAttempt('short_answer', [onTheSpot])).toBeNull();
    expect(handedInAttempt('short_answer', [{ ...onTheSpot, status: 'ROUTED_FOR_REVIEW' }])).not.toBeNull();
    expect(handedInAttempt('short_answer', [{ ...onTheSpot, reviewedBy: 'teacher' }])).not.toBeNull();
  });

  it('ignores an attempt of another template (the exercise was rebuilt)', () => {
    expect(handedInAttempt('writing_task', [row({ templateCode: 'translate_to_target' })])).toBeNull();
  });
});

describe('handedInVerdictOf', () => {
  it('waits for the teacher, with the model first where the school has it, and never counts as passed', () => {
    const v = handedInVerdictOf(row({ aiFirst: true }));
    expect(v).toMatchObject({ requiresReview: true, reviewer: 'teacher', aiFirst: true, attemptId: 'a1' });
    expect(isPassedVerdict(v)).toBe(false);
  });

  it('waits for a model for a learner on their own', () => {
    expect(handedInVerdictOf(row({ schoolId: null }))).toMatchObject({ requiresReview: true, reviewer: 'ai' });
  });

  it('says nobody reads it, and keeps work on the phone apart', () => {
    expect(handedInVerdictOf(row({ status: 'NO_REVIEWER' }))).toMatchObject({ reviewer: 'none' });
    expect(handedInVerdictOf(row(), true)).toMatchObject({ requiresReview: true, onPhone: true });
  });

  it('carries the reader’s verdict once there is one', () => {
    const passed = handedInVerdictOf(row({ status: 'SCORED', reviewedBy: 'teacher', passed: true }));
    expect(passed).toMatchObject({ requiresReview: false, passed: true });
    const returned = handedInVerdictOf(row({ status: 'RETURNED', reviewedBy: 'ai', passed: false }));
    expect(returned).toMatchObject({ requiresReview: false, passed: false });
    expect(handedInState(row({ status: 'RETURNED' }))).toEqual({ kind: 'reviewed', by: 'teacher', passed: false });
  });

  it('counts an outright approval by the key as passed', () => {
    const v = handedInVerdictOf(row({ templateCode: 'error_correction', status: 'SCORED', reviewedBy: null }));
    expect(isPassedVerdict(v)).toBe(true);
  });
});

describe('againAllowed', () => {
  it('lets error_correction and translate go again unless the author allows one attempt', () => {
    expect(againAllowed('error_correction', { flow: { attempts: 'free' } }, row())).toBe(true);
    expect(againAllowed('error_correction', {}, row())).toBe(true);
    expect(againAllowed('translate_to_target', { flow: { attempts: 'once' } }, row())).toBe(false);
  });

  it('lets writing_task be rewritten only after a reader failed it, and never under «once»', () => {
    expect(againAllowed('writing_task', writing(), row())).toBe(false);
    expect(againAllowed('writing_task', writing(), row({ status: 'SCORED', reviewedBy: 'teacher', passed: true }))).toBe(false);
    const failed = row({ status: 'RETURNED', reviewedBy: 'teacher', passed: false });
    expect(againAllowed('writing_task', writing(), failed)).toBe(true);
    expect(againAllowed('writing_task', writing('once'), failed)).toBe(false);
  });

  it('always lets a short_answer set be walked again', () => {
    expect(againAllowed('short_answer', {}, row())).toBe(true);
  });
});

describe('correctedSentence', () => {
  it('applies rewrites, strike-outs and insertions by slot', () => {
    const words = ['Jeg', 'har', 'bodd', 'i', 'Norge', 'siden', 'to', 'år'];
    expect(
      correctedSentence(words, { fix: { 1: 'har', 6: '' }, ins: { 7: 'to' }, marked: {} }),
    ).toBe('Jeg har bodd i Norge siden to år');
    expect(correctedSentence(['han', 'gå'], { fix: { 1: 'går' }, ins: { 0: 'I går' }, marked: {} })).toBe(
      'I går han går',
    );
    expect(correctedSentence(['a', 'b'], undefined)).toBe('a b');
  });
});

describe('handedInLines', () => {
  it('reads the essay back', () => {
    expect(handedInLines('writing_task', writing(), { text: '  Hei!  ', ticked: [] })).toEqual([
      { key: 'text', prompt: null, text: 'Hei!' },
    ]);
    expect(handedInLines('writing_task', writing(), null)).toEqual([]);
  });

  it('pairs each corrected sentence with the wrong one', () => {
    const content = { items: [{ id: 'i1', wrong: 'Han gå hjem' }, { id: 'i2', wrong: 'Vi er glad' }] };
    const answer = { items: { i1: { fix: { 1: 'går' }, ins: {}, marked: { 1: true } } } };
    expect(handedInLines('error_correction', content, answer)).toEqual([
      { key: 'i1', prompt: 'Han gå hjem', text: 'Han går hjem' },
    ]);
  });

  it('pairs each translation with its source', () => {
    const content = {
      dir: 'to_target',
      items: [{ id: 's1', dir: 'to_target', source: 'Семья живёт в Бергене.' }],
      langs: { target: 'Norsk', explain: 'Russisk' },
    };
    expect(
      handedInLines('translate_to_target', content, [{ itemId: 's1', text: 'Familien bor i Bergen.' }]),
    ).toEqual([{ key: 's1', prompt: 'Семья живёт в Бергене.', text: 'Familien bor i Bergen.' }]);
  });

  it('pairs each short answer with its question, old form included', () => {
    const content = {
      instruction: '',
      questions: [{ id: 'q1', kind: 'reading', prompt: 'Hvor flyttet Kari?' }],
      settings: {},
    };
    expect(handedInLines('short_answer', content, { answers: [{ questionId: 'q1', text: 'Til Bergen.' }] })).toEqual([
      { key: 'q1', prompt: 'Hvor flyttet Kari?', text: 'Til Bergen.' },
    ]);
    expect(handedInLines('short_answer', { question: 'Hvor bor hun?' }, { text: 'I Oslo.' })).toEqual([
      { key: 'text', prompt: 'Hvor bor hun?', text: 'I Oslo.' },
    ]);
  });
});
