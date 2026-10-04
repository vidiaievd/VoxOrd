import { wordCount } from '../../../lib/text/words';
import {
  buildDictationSubmission,
  nextOpen,
  railStates,
  readDictationProjection,
  readDictationVerdict,
  readSegmentStates,
  resumeAt,
  summaryRows,
  transcriptSlices,
  type ProjectedSegment,
  type SegmentState,
} from './dictation';

/** The projection as content-service and the engine deal it (plan 68 phase 3). */
const PROJECTION = {
  instruction: 'Hør og skriv det du hører.',
  mode: 'segments',
  segments: [
    { id: 's1', wordCount: 6 },
    { id: 's2', wordCount: 4 },
    { id: 's3' },
  ],
  settings: { attempts: 2, hints: true, revealKey: true, showWordCount: true },
  audio: { enabled: true, segments: { s1: { start: 0, end: 3.2 } } },
};

const SEGMENTS: ProjectedSegment[] = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];

function state(
  segmentId: string,
  patch: Partial<SegmentState> = {},
): SegmentState {
  return {
    segmentId,
    checks: 0,
    firstScore: null,
    firstPassed: null,
    passed: false,
    revealed: false,
    closed: false,
    lastText: '',
    last: null,
    key: null,
    transcriptSlice: null,
    ...patch,
  };
}

describe('readDictationProjection', () => {
  it('reads the student projection', () => {
    expect(readDictationProjection(PROJECTION)).toEqual({
      instruction: 'Hør og skriv det du hører.',
      mode: 'segments',
      segments: [
        { id: 's1', wordCount: 6 },
        { id: 's2', wordCount: 4 },
        { id: 's3' },
      ],
      settings: {
        attempts: 2,
        hints: true,
        revealKey: true,
        showWordCount: true,
      },
    });
  });

  it.each(['orphans', 'marking', 'threshold', 'language', 'transcript'])(
    'refuses a document carrying `%s` at its root (AC-X2)',
    field => {
      expect(
        readDictationProjection({ ...PROJECTION, [field]: {} }),
      ).toBeNull();
    },
  );

  it.each(['text', 'why', 'focus'])(
    'refuses a sentence carrying `%s` (AC-X2)',
    field => {
      expect(
        readDictationProjection({
          ...PROJECTION,
          segments: [{ id: 's1', [field]: 'Jeg bor i en liten leilighet.' }],
        }),
      ).toBeNull();
    },
  );

  it('refuses settings carrying the pass mark', () => {
    expect(
      readDictationProjection({ ...PROJECTION, settings: { threshold: 80 } }),
    ).toBeNull();
  });

  it('shows no count the projection did not mean to give (AC-R3)', () => {
    const read = readDictationProjection({
      ...PROJECTION,
      segments: [
        { id: 's1', wordCount: 0 },
        { id: 's2', wordCount: 2.5 },
        { id: 's3', wordCount: '4' },
      ],
    });
    expect(read?.segments).toEqual([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
  });

  it('reads an unknown budget as no limit, and an unknown mode as sentences', () => {
    const read = readDictationProjection({
      ...PROJECTION,
      mode: 'other',
      settings: { attempts: 7 },
    });
    expect(read?.mode).toBe('segments');
    expect(read?.settings).toEqual({
      attempts: 0,
      hints: false,
      revealKey: false,
      showWordCount: false,
    });
  });

  it('reads `whole`', () => {
    expect(
      readDictationProjection({ ...PROJECTION, mode: 'whole' })?.mode,
    ).toBe('whole');
  });

  it('refuses what is not a dictation', () => {
    expect(readDictationProjection(null)).toBeNull();
    expect(readDictationProjection({ instruction: 'x' })).toBeNull();
    expect(
      readDictationProjection({ ...PROJECTION, segments: [{ id: '' }] }),
    ).toBeNull();
  });
});

/** A failed check of «Jeg bor i en liten leilighet.» as the engine answers it. */
const FAILED = {
  segmentId: 's1',
  pct: 75,
  passed: false,
  words: { total: 6, exact: 4, near: 1, wrong: 0, missing: 1, extra: 1 },
  ops: [
    { k: 'eq', i: 0, w: 'Jeg', p: '' },
    { k: 'eq', i: 1, w: 'bor', p: '' },
    { k: 'ins', wrote: 'nå', p: '' },
    { k: 'eq', i: 2, w: 'i', p: '' },
    { k: 'del', i: 3, expected: 'en', p: '', focus: false },
    {
      k: 'sub',
      i: 4,
      n: 1,
      wrote: 'lilen',
      expected: 'liten',
      p: '',
      cls: 'typo',
      near: true,
      focus: true,
      why: 'Liten — med t.',
    },
    { k: 'eq', i: 5, w: 'leilighet', p: '.' },
    { k: 'mystery' },
  ],
  nearCredit: true,
  focus: [{ focusId: 'f1', word: 'liten', why: 'Liten — med t.' }],
  why: 'Adjektivet står før substantivet.',
  attempt: 1,
  checksLeft: 1,
  closed: false,
  revealed: false,
  segments: [
    {
      segmentId: 's1',
      checks: 1,
      firstScore: 0.75,
      firstPassed: false,
      passed: false,
      revealed: false,
      closed: false,
      lastText: 'Jeg bor nå i lilen leilighet.',
      lastCheckAt: 1000,
      first: { words: {}, classes: ['typo'], wrongFocus: ['f1'], ops: [] },
      last: null,
      key: null,
      transcriptSlice: null,
    },
  ],
  complete: false,
  attemptPct: 25,
  attemptPassed: false,
};

describe('readDictationVerdict', () => {
  it('reads a failed check, every kind of op, and drops an op it cannot draw', () => {
    const v = readDictationVerdict(FAILED);
    expect(v).not.toBeNull();
    expect(v?.ops.map(op => op.k)).toEqual([
      'eq',
      'eq',
      'ins',
      'eq',
      'del',
      'sub',
      'eq',
    ]);
    expect(v?.ops[5]).toEqual({
      k: 'sub',
      wrote: 'lilen',
      expected: 'liten',
      p: '',
      cls: 'typo',
      near: true,
      focus: true,
      why: 'Liten — med t.',
    });
    expect(v?.words).toEqual({
      total: 6,
      exact: 4,
      near: 1,
      wrong: 0,
      missing: 1,
      extra: 1,
    });
    expect(v?.nearCredit).toBe(true);
    expect(v?.focus).toEqual([
      { focusId: 'f1', word: 'liten', why: 'Liten — med t.' },
    ]);
    expect(v?.why).toBe('Adjektivet står før substantivet.');
    expect(v?.checksLeft).toBe(1);
    expect(v?.segments[0]?.lastText).toBe('Jeg bor nå i lilen leilighet.');
    expect(v?.key).toBeUndefined();
  });

  it('reads an unknown error class as a different word', () => {
    const v = readDictationVerdict({
      ...FAILED,
      ops: [
        {
          k: 'sub',
          wrote: 'a',
          expected: 'b',
          p: '',
          cls: 'zzz',
          near: false,
          focus: false,
        },
      ],
    });
    expect(v?.ops[0]).toMatchObject({ k: 'sub', cls: 'wrong' });
  });

  it('reads a reveal: the sentence, its reason and its focus words', () => {
    const v = readDictationVerdict({
      ...FAILED,
      ops: [],
      revealed: true,
      closed: true,
      checksLeft: null,
      key: {
        text: 'Jeg bor i en liten leilighet.',
        why: 'Adjektivet står før substantivet.',
        focus: [{ focusId: 'f1', word: 'liten', why: '' }, { word: 'no id' }],
      },
      transcriptSlice: 'Jeg bor i en liten leilighet.',
    });
    expect(v?.key).toEqual({
      text: 'Jeg bor i en liten leilighet.',
      why: 'Adjektivet står før substantivet.',
      focus: [{ focusId: 'f1', word: 'liten', why: '' }],
    });
    expect(v?.transcriptSlice).toBe('Jeg bor i en liten leilighet.');
    expect(v?.checksLeft).toBeNull();
  });

  it('is null for another template’s details', () => {
    expect(
      readDictationVerdict({ questionId: 'q1', cells: [], questions: [] }),
    ).toBeNull();
    expect(readDictationVerdict({ segmentId: 's1' })).toBeNull();
    expect(readDictationVerdict(undefined)).toBeNull();
  });
});

describe('readSegmentStates', () => {
  it('reads what the learner was shown, and drops a malformed entry', () => {
    const read = readSegmentStates([
      {
        segmentId: 's1',
        checks: 2.7,
        firstScore: 0.5,
        firstPassed: false,
        passed: true,
        closed: true,
        lastText: 'Jeg bor i en liten leilighet.',
        last: {
          pct: 100,
          words: { total: 6, exact: 6 },
          ops: [{ k: 'eq', w: 'Jeg', p: '' }],
          why: '',
        },
        transcriptSlice: 'Jeg bor i en liten leilighet.',
      },
      { checks: 1 },
      'junk',
    ]);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({
      segmentId: 's1',
      checks: 2,
      passed: true,
      closed: true,
      revealed: false,
      key: null,
      transcriptSlice: 'Jeg bor i en liten leilighet.',
    });
    expect(read[0]?.last).toEqual({
      pct: 100,
      words: { total: 6, exact: 6, near: 0, wrong: 0, missing: 0, extra: 0 },
      ops: [{ k: 'eq', w: 'Jeg', p: '' }],
    });
  });

  it('reads anything but an array as nothing', () => {
    expect(readSegmentStates(null)).toEqual([]);
    expect(readSegmentStates({ segmentId: 's1' })).toEqual([]);
  });
});

describe('buildDictationSubmission', () => {
  it('sends the text as typed on a check', () => {
    expect(buildDictationSubmission('s1', ' Jeg bor ', false)).toEqual({
      segmentId: 's1',
      text: ' Jeg bor ',
    });
  });

  it('sends no text on a reveal', () => {
    expect(buildDictationSubmission('s1', 'Jeg bor', true)).toEqual({
      segmentId: 's1',
      reveal: true,
    });
  });
});

describe('resumeAt / nextOpen', () => {
  it('opens a fresh attempt on the first sentence, first check, empty field', () => {
    expect(resumeAt(SEGMENTS, [])).toEqual({ index: 0, attempt: 1, text: '' });
  });

  it('resumes on the first open sentence with its last checked text back (plan 68 §8, 3)', () => {
    const states = [
      state('s1', { checks: 1, passed: true, closed: true }),
      state('s2', { checks: 1, lastText: 'Det er kaldt' }),
    ];
    expect(resumeAt(SEGMENTS, states)).toEqual({
      index: 1,
      attempt: 2,
      text: 'Det er kaldt',
    });
  });

  it('goes forward to the next open sentence, skipping closed ones', () => {
    const states = [
      state('s1', { checks: 1, closed: true }),
      state('s2', { revealed: true, closed: true }),
    ];
    expect(nextOpen(SEGMENTS, states, 0)).toEqual({
      index: 2,
      attempt: 1,
      text: '',
    });
  });

  it('is null after the last open sentence — the summary follows', () => {
    const states = [state('s3', { checks: 2, closed: true })];
    expect(nextOpen(SEGMENTS, states, 2)).toBeNull();
  });
});

describe('railStates', () => {
  it('draws spelled right, checked and not right, and the one being written', () => {
    const states = [
      state('s1', { checks: 2, passed: true, closed: true }),
      state('s2', { checks: 1 }),
    ];
    expect(railStates(SEGMENTS, states, 2)).toEqual(['done', 'part', 'now']);
  });

  it('counts a revealed sentence as not right', () => {
    expect(
      railStates(SEGMENTS, [state('s1', { revealed: true, closed: true })], 1),
    ).toEqual(['part', 'now', null]);
  });
});

describe('transcriptSlices', () => {
  it('gives the closed sentences’ slices in order, never an open one’s (§3.6)', () => {
    const states = [
      state('s3', { closed: true, transcriptSlice: 'Tre.' }),
      state('s2', { checks: 1 }),
      state('s1', { closed: true, transcriptSlice: 'En.' }),
    ];
    expect(transcriptSlices(SEGMENTS, states)).toEqual(['En.', 'Tre.']);
  });
});

describe('summaryRows', () => {
  it('puts the last corrected line beside the first check’s score (AC-R8, AC-R10)', () => {
    const states = [
      state('s1', {
        checks: 2,
        firstScore: 0.6,
        firstPassed: false,
        passed: true,
        closed: true,
        last: {
          pct: 100,
          words: {
            total: 1,
            exact: 1,
            near: 0,
            wrong: 0,
            missing: 0,
            extra: 0,
          },
          ops: [{ k: 'eq', w: 'Hei', p: '' }],
          why: 'gammel',
        },
      }),
      state('s2', {
        revealed: true,
        closed: true,
        key: { text: 'Det er kaldt.', why: 'Kaldt med d.', focus: [] },
      }),
      state('s3', {
        checks: 1,
        firstScore: 0.9,
        firstPassed: true,
        passed: false,
        closed: true,
        last: {
          pct: 40,
          words: {
            total: 2,
            exact: 1,
            near: 0,
            wrong: 1,
            missing: 0,
            extra: 0,
          },
          ops: [],
          why: 'Husk endelsen.',
        },
      }),
    ];
    const { rows, right } = summaryRows(SEGMENTS, states);
    expect(right).toBe(1);
    expect(rows[0]).toEqual({
      id: 's1',
      n: 1,
      ops: [{ k: 'eq', w: 'Hei', p: '' }],
      keyText: null,
      // Spelled right in the end: no reason under it.
      reason: '',
      pct: 60,
      ok: false,
    });
    expect(rows[1]).toMatchObject({
      ops: null,
      keyText: 'Det er kaldt.',
      reason: 'Kaldt med d.',
      pct: 0,
    });
    expect(rows[2]).toMatchObject({
      reason: 'Husk endelsen.',
      pct: 90,
      ok: true,
    });
  });
});

describe('wordCount', () => {
  it('counts the words the server counts, a decomposed å as one letter', () => {
    expect(wordCount('Jeg bor i en liten leilighet.')).toBe(6);
    expect(wordCount('Jårn e-post')).toBe(2);
    expect(wordCount('   ')).toBe(0);
  });
});
