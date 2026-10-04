import {
  buildHighlightInTextSubmission,
  completedOf,
  gapInsideRun,
  keepExact,
  nextOpen,
  paragraphOfTokens,
  passageCells,
  readHighlightInTextPassage,
  readHighlightInTextVerdict,
  resumeAt,
  toggleMark,
  tokenAtPoint,
  tokenize,
  type HighlightInTextVerdict,
  type QuestionState,
  type TokenRect,
} from './highlightInText';

/**
 * The kernel's `TOKENIZER_FIXTURE` (shared-kernel `highlight-in-text/tokenizer-fixture.ts`),
 * copied word for word: the engine's suite and the kernel's run the same text, and this
 * app's copy of the expression must find the same words at the same offsets (AC-M1).
 */
const TOKENIZER_FIXTURE = {
  text:
    '«Hun sa: "Jeg har fått e-post." Han svarte: don\'t og barn’s.»\n' +
    'I 1998 var det førti sjølv-stendige elever i Bodø, ikke flere.\n' +
    '\n' +
    'Nytt avsnitt — 3,5 timer (cirka).',
  words: [
    'Hun',
    'sa',
    'Jeg',
    'har',
    'fått',
    'e-post',
    'Han',
    'svarte',
    "don't",
    'og',
    'barn’s',
    'I',
    '1998',
    'var',
    'det',
    'førti',
    'sjølv-stendige',
    'elever',
    'i',
    'Bodø',
    'ikke',
    'flere',
    'Nytt',
    'avsnitt',
    '3',
    '5',
    'timer',
    'cirka',
  ],
};

const TEXT =
  'I fjor sommer reiste vi til Bergen. Det regnet hver dag.\n\nNå bor vi i Oslo.';
const PARAGRAPHS: Array<[number, number]> = [
  [0, 56],
  [58, 75],
];
const tokens = tokenize(TEXT);
const paragraphOf = paragraphOfTokens(tokens, PARAGRAPHS);

function verdict(
  patch: Partial<HighlightInTextVerdict> = {},
): HighlightInTextVerdict {
  return {
    questionId: 'q1',
    pct: 50,
    passed: false,
    exact: 1,
    near: 0,
    miss: 1,
    fp: 0,
    total: 2,
    cells: [],
    attempt: 1,
    checksLeft: 1,
    closed: false,
    revealed: false,
    questions: [],
    complete: false,
    attemptPct: 0,
    attemptPassed: false,
    ...patch,
  };
}

function state(
  questionId: string,
  patch: Partial<QuestionState> = {},
): QuestionState {
  return {
    questionId,
    checks: 1,
    firstScore: 1,
    firstPassed: true,
    passed: true,
    revealed: false,
    closed: true,
    ...patch,
  };
}

describe('tokenize', () => {
  it('AC-M1: finds exactly the kernel fixture words, each at its own offsets', () => {
    const found = tokenize(TOKENIZER_FIXTURE.text);
    expect(found.map(t => t.w)).toEqual(TOKENIZER_FIXTURE.words);
    for (const t of found)
      expect(TOKENIZER_FIXTURE.text.slice(t.s, t.e)).toBe(t.w);
    expect(found.map(t => t.i)).toEqual(found.map((_, i) => i));
  });

  it('is not Norwegian — Cyrillic and Latin alike', () => {
    expect(tokenize('Прочитайте текст, mark it.').map(t => t.w)).toEqual([
      'Прочитайте',
      'текст',
      'mark',
      'it',
    ]);
  });
});

describe('paragraphOfTokens', () => {
  it('reads the paragraph of each token off the projection ranges', () => {
    expect(paragraphOf.slice(0, 2)).toEqual([0, 0]);
    expect(paragraphOf[tokens.findIndex(t => t.w === 'Nå')]).toBe(1);
    expect(paragraphOf[tokens.length - 1]).toBe(1);
  });
});

describe('readHighlightInTextPassage', () => {
  const projection = {
    instruction: 'Les teksten.',
    text: TEXT,
    paragraphs: PARAGRAPHS,
    questions: [
      { id: 'q1', prompt: 'Tidsuttrykk', unit: 'phrase', count: 2 },
      { id: 'q2', prompt: 'Verb i preteritum', unit: 'word', count: null },
    ],
    settings: { attempts: 2, hints: true, revealKey: true },
  };

  it('reads the student projection', () => {
    const passage = readHighlightInTextPassage(projection);
    expect(passage?.questions.map(q => [q.id, q.unit, q.count])).toEqual([
      ['q1', 'phrase', 2],
      ['q2', 'word', null],
    ]);
    expect(passage?.settings).toEqual({
      attempts: 2,
      hints: true,
      revealKey: true,
    });
  });

  it('AC-S11: refuses a passage that carries any part of the key', () => {
    expect(readHighlightInTextPassage({ ...projection, spans: [] })).toBeNull();
    expect(
      readHighlightInTextPassage({
        ...projection,
        questions: [
          { ...projection.questions[0], spans: [{ start: 0, end: 6 }] },
        ],
      }),
    ).toBeNull();
    expect(
      readHighlightInTextPassage({
        ...projection,
        settings: { ...projection.settings, threshold: 70 },
      }),
    ).toBeNull();
  });

  it('takes the whole text as one paragraph when none were sent', () => {
    expect(
      readHighlightInTextPassage({ ...projection, paragraphs: undefined })
        ?.paragraphs,
    ).toEqual([[0, TEXT.length]]);
  });
});

describe('readHighlightInTextVerdict', () => {
  it('reads the contracted details and drops cells without a range', () => {
    const read = readHighlightInTextVerdict({
      questionId: 'q1',
      pct: 50,
      passed: false,
      exact: 1,
      near: 1,
      miss: 0,
      fp: 0,
      total: 2,
      cells: [
        { start: 0, end: 6, state: 'near', keyStart: 0, keyEnd: 13 },
        { start: 4, end: 4, state: 'fp' },
      ],
      attempt: 1,
      checksLeft: null,
      closed: false,
      revealed: false,
      questions: [
        {
          questionId: 'q1',
          checks: 1,
          firstScore: 0.5,
          firstPassed: false,
          passed: false,
          revealed: false,
          closed: false,
        },
      ],
      complete: false,
      attemptPct: 0,
      attemptPassed: false,
    });
    expect(read?.cells).toEqual([
      { start: 0, end: 6, state: 'near', keyStart: 0, keyEnd: 13 },
    ]);
    expect(read?.checksLeft).toBeNull();
    expect(read?.questions[0].checks).toBe(1);
  });

  it('is null for another template', () => {
    expect(readHighlightInTextVerdict({ correctNow: 3 })).toBeNull();
  });
});

describe('toggleMark', () => {
  it('AC-S2: a tap marks one word, a second tap on it unmarks it', () => {
    const once = toggleMark([], 2, 2, 'word', paragraphOf);
    expect(once).toEqual([{ t0: 2, t1: 2 }]);
    expect(toggleMark(once, 2, 2, 'word', paragraphOf)).toEqual([]);
  });

  it('under `word` a drag marks only where it started', () => {
    expect(toggleMark([], 0, 2, 'word', paragraphOf)).toEqual([
      { t0: 0, t1: 0 },
    ]);
  });

  it('AC-S3: under `phrase` a drag marks the run and replaces what it touches', () => {
    const marks = toggleMark([{ t0: 1, t1: 1 }], 0, 2, 'phrase', paragraphOf);
    expect(marks).toEqual([{ t0: 0, t1: 2 }]);
  });

  it('a tap inside a phrase mark removes the whole mark', () => {
    expect(toggleMark([{ t0: 0, t1: 2 }], 1, 1, 'phrase', paragraphOf)).toEqual(
      [],
    );
  });

  it('a drag never crosses a paragraph — it is cut at the origin’s', () => {
    const last = tokens.length - 1;
    const firstOfSecond = tokens.findIndex(t => t.w === 'Nå');
    expect(
      toggleMark([], firstOfSecond - 1, last, 'phrase', paragraphOf),
    ).toEqual([{ t0: firstOfSecond - 1, t1: firstOfSecond - 1 }]);
  });
});

describe('keepExact and the submission', () => {
  it('AC-S6: a retry keeps exactly the marks called exact', () => {
    const marks = [
      { t0: 0, t1: 2 },
      { t0: 4, t1: 4 },
      { t0: 7, t1: 7 },
    ];
    const cells = [
      { start: tokens[0].s, end: tokens[2].e, state: 'exact' as const },
      { start: tokens[4].s, end: tokens[4].e, state: 'fp' as const },
      { start: tokens[7].s, end: tokens[7].e, state: 'near' as const },
    ];
    expect(keepExact(marks, cells, tokens)).toEqual([{ t0: 0, t1: 2 }]);
  });

  it('sends character offsets, and nothing but the question on a reveal', () => {
    expect(
      buildHighlightInTextSubmission('q1', [{ t0: 0, t1: 2 }], tokens, false),
    ).toEqual({
      questionId: 'q1',
      marks: [{ start: 0, end: 13 }],
    });
    expect(
      buildHighlightInTextSubmission('q1', [{ t0: 0, t1: 2 }], tokens, true),
    ).toEqual({
      questionId: 'q1',
      marks: [],
      reveal: true,
    });
  });
});

describe('passageCells', () => {
  it('marking: the student’s own marks only', () => {
    const { cells } = passageCells([{ t0: 0, t1: 1 }], null, tokens);
    expect([...cells.keys()]).toEqual([0, 1]);
    expect(cells.get(0)?.m).toBe('sel');
  });

  it('checked: states as the server sent them, and the key boundary under a near mark', () => {
    const { cells } = passageCells(
      [],
      verdict({
        cells: [
          {
            start: tokens[2].s,
            end: tokens[2].e,
            state: 'near',
            keyStart: 0,
            keyEnd: tokens[2].e,
          },
          { start: tokens[4].s, end: tokens[4].e, state: 'fp' },
        ],
      }),
      tokens,
    );
    expect(cells.get(2)).toEqual({ m: 'near', k: 'c0', keyLine: true });
    expect(cells.get(0)).toEqual({ m: 'miss', k: 'c0', keyLine: true });
    expect(cells.get(4)?.m).toBe('fp');
    expect(cells.has(3)).toBe(false);
  });

  it('revealed: the whole key, numbered on the first token of each span', () => {
    const { cells, numbers } = passageCells(
      [{ t0: 9, t1: 9 }],
      verdict({
        revealed: true,
        closed: true,
        key: [
          { n: 1, start: 0, end: tokens[2].e },
          {
            n: 2,
            start: tokens[9].s,
            end: tokens[10].e,
            why: 'hver + substantiv',
          },
        ],
      }),
      tokens,
    );
    expect(cells.get(1)?.m).toBe('key');
    expect(numbers.get(0)).toBe(1);
    expect(numbers.get(9)).toBe(2);
    expect(numbers.has(10)).toBe(false);
  });

  it('AC-M2: the gap inside a run is painted, the one between two runs is not', () => {
    const { cells } = passageCells(
      [
        { t0: 0, t1: 1 },
        { t0: 2, t1: 2 },
      ],
      null,
      tokens,
    );
    expect(gapInsideRun(cells, 0)).toBe(true);
    expect(gapInsideRun(cells, 1)).toBe(false);
    expect(gapInsideRun(cells, 2)).toBe(false);
  });
});

describe('where the questions stand', () => {
  const questions = [
    { id: 'q1', prompt: 'A', unit: 'word' as const, count: null },
    { id: 'q2', prompt: 'B', unit: 'phrase' as const, count: null },
    { id: 'q3', prompt: 'C', unit: 'word' as const, count: null },
  ];

  it('AC-S12: the rail marks every closed question, passed or not', () => {
    expect(
      completedOf(questions, [
        state('q1'),
        state('q2', { closed: false, passed: false }),
      ]),
    ).toEqual([true, false, false]);
    expect(
      completedOf(questions, [state('q3', { passed: false, revealed: true })]),
    ).toEqual([false, false, true]);
  });

  it('resumes on the first open question, on the check after its last', () => {
    expect(resumeAt(questions, [])).toEqual({ index: 0, attempt: 1 });
    expect(
      resumeAt(questions, [
        state('q1'),
        state('q2', { closed: false, passed: false, checks: 2 }),
      ]),
    ).toEqual({ index: 1, attempt: 3 });
  });

  it('«Next» goes to the next open question, wrapping round to an earlier one', () => {
    expect(nextOpen(questions, [state('q1')], 0)).toEqual({
      index: 1,
      attempt: 1,
    });
    expect(nextOpen(questions, [state('q2'), state('q3')], 2)).toEqual({
      index: 0,
      attempt: 1,
    });
    expect(
      nextOpen(questions, [state('q1'), state('q2'), state('q3')], 2),
    ).toBeNull();
  });
});

describe('tokenAtPoint', () => {
  const rects = new Map<number, TokenRect>([
    [0, { x: 0, y: 0, width: 20, height: 30 }],
    [1, { x: 30, y: 0, width: 40, height: 30 }],
    [2, { x: 0, y: 40, width: 50, height: 30 }],
  ]);

  it('finds the token under the finger', () => {
    expect(tokenAtPoint(rects, 40, 10)).toBe(1);
    expect(tokenAtPoint(rects, 10, 50)).toBe(2);
  });

  it('between words and past the line end it takes the nearest word on that line', () => {
    expect(tokenAtPoint(rects, 24, 10)).toBe(0);
    expect(tokenAtPoint(rects, 300, 15)).toBe(1);
    expect(tokenAtPoint(rects, 300, 50)).toBe(2);
  });

  it('is null before anything is measured', () => {
    expect(tokenAtPoint(new Map(), 0, 0)).toBeNull();
  });
});
