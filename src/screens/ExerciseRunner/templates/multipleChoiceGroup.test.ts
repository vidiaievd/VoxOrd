import {
  buildMultipleChoiceGroupSubmission,
  isMultipleChoiceGroupDocument,
  keepOnRetry,
  readMultipleChoiceGroupTable,
  readMultipleChoiceGroupVerdict,
  unansweredCount,
  type MultipleChoiceGroupItemResult,
} from './multipleChoiceGroup';

/** A projection as content-service sends it: no answer, no why, no quote, rows shuffled. */
const projection = {
  instruction: 'Riktig eller galt? Velg svaret som stemmer med teksten.',
  source: { mode: 'inline', label: 'Tekst 1A', text: 'Bartek søker ny jobb.' },
  columns: [
    { id: 'c-r', label: 'Riktig' },
    { id: 'c-g', label: 'Galt' },
  ],
  rows: [
    { id: 'r1', text: 'Bartek er fornøyd med jobben sin.' },
    { id: 'r2', text: 'Bartek vil bytte jobb.' },
  ],
  settings: {
    numbering: false,
    layout: 'cards',
    retry: 'unlimited',
    progress: false,
    showText: true,
    passThreshold: 100,
  },
};

describe('isMultipleChoiceGroupDocument', () => {
  it('tells the plan-54 form from the old one by `rows` alone', () => {
    expect(isMultipleChoiceGroupDocument(projection)).toBe(true);
    // Empty is still the new form — an author's table starts out with nothing in it.
    expect(isMultipleChoiceGroupDocument({ rows: [] })).toBe(true);
    expect(isMultipleChoiceGroupDocument({ items: [{ id: 'i1' }] })).toBe(false);
    expect(isMultipleChoiceGroupDocument(null)).toBe(false);
    expect(isMultipleChoiceGroupDocument('rows')).toBe(false);
  });
});

describe('readMultipleChoiceGroupTable', () => {
  it('reads the projection whole', () => {
    const table = readMultipleChoiceGroupTable(projection);
    expect(table).not.toBeNull();
    expect(table!.instruction).toBe(projection.instruction);
    expect(table!.rows.map(r => r.id)).toEqual(['r1', 'r2']);
    expect(table!.columns).toEqual([
      { id: 'c-r', label: 'Riktig' },
      { id: 'c-g', label: 'Galt' },
    ]);
    expect(table!.source).toEqual({
      mode: 'inline',
      label: 'Tekst 1A',
      text: 'Bartek søker ny jobb.',
    });
    expect(table!.settings).toEqual(projection.settings);
  });

  it('falls back to the kernel defaults when settings are missing or junk', () => {
    const table = readMultipleChoiceGroupTable({ ...projection, settings: { layout: 'wide' } });
    expect(table!.settings).toEqual({
      numbering: true,
      layout: 'auto',
      retry: 'one',
      progress: true,
      showText: true,
      passThreshold: 70,
    });
  });

  // The three fields that are the key. A row carrying any of them is the stored document,
  // and the answer to that is to refuse rather than to strip (plan 54 §3.2).
  it.each(['answer', 'why', 'quote'])('refuses a table whose rows carry `%s`', field => {
    const leaked = {
      ...projection,
      rows: [{ id: 'r1', text: 'Bartek er fornøyd.', [field]: 'c-g' }],
    };
    expect(readMultipleChoiceGroupTable(leaked)).toBeNull();
  });

  it('refuses a table with fewer than two columns', () => {
    expect(
      readMultipleChoiceGroupTable({ ...projection, columns: [{ id: 'c-r', label: 'Riktig' }] }),
    ).toBeNull();
  });

  it('refuses rows and columns that are not usable', () => {
    expect(readMultipleChoiceGroupTable({ ...projection, rows: [{ id: '', text: 'x' }] })).toBeNull();
    expect(
      readMultipleChoiceGroupTable({ ...projection, rows: [{ id: 'r1', text: '   ' }] }),
    ).toBeNull();
    expect(
      readMultipleChoiceGroupTable({
        ...projection,
        columns: [
          { id: 'c-r', label: '' },
          { id: 'c-g', label: 'Galt' },
        ],
      }),
    ).toBeNull();
  });

  it('refuses anything that is not a table', () => {
    expect(readMultipleChoiceGroupTable(null)).toBeNull();
    expect(readMultipleChoiceGroupTable([])).toBeNull();
    expect(readMultipleChoiceGroupTable({ items: [] })).toBeNull();
  });

  it('withholds the passage the projection withheld, and the lesson it did not name', () => {
    const table = readMultipleChoiceGroupTable({
      ...projection,
      source: { mode: 'link', label: 'Leksjon 1A' },
    });
    expect(table!.source).toEqual({ mode: 'link', label: 'Leksjon 1A' });
    expect(table!.source.text).toBeUndefined();
    expect(table!.source.lessonId).toBeUndefined();
  });
});

describe('readMultipleChoiceGroupVerdict', () => {
  it('reads a check that left the table open, without inventing the key', () => {
    const verdict = readMultipleChoiceGroupVerdict({
      totalItems: 2,
      passedItems: 1,
      attempt: 1,
      attemptsLeft: 1,
      closed: false,
      locked: ['r1'],
      items: [
        { itemId: 'r1', submitted: 'c-r', correct: true, firstAnswer: 'c-r' },
        { itemId: 'r2', submitted: 'c-r', correct: false, firstAnswer: 'c-r' },
      ],
    });

    expect(verdict).not.toBeNull();
    expect(verdict!.closed).toBe(false);
    expect(verdict!.locked).toEqual(['r1']);
    expect(verdict!.items[1].keyColumnId).toBeUndefined();
    expect(verdict!.items[1].why).toBeUndefined();
    expect(verdict!.items[1].quote).toBeUndefined();
  });

  it('carries the key, the line and the quote once the table is closed', () => {
    const verdict = readMultipleChoiceGroupVerdict({
      totalItems: 1,
      passedItems: 0,
      attempt: 2,
      attemptsLeft: 0,
      closed: true,
      locked: [],
      items: [
        {
          itemId: 'r2',
          submitted: 'c-r',
          correct: false,
          firstAnswer: 'c-g',
          keyColumnId: 'c-g',
          why: 'Han vil bytte jobb.',
          quote: 'Bartek søker ny jobb.',
        },
      ],
    });

    expect(verdict!.items[0]).toEqual({
      itemId: 'r2',
      submitted: 'c-r',
      correct: false,
      firstAnswer: 'c-g',
      keyColumnId: 'c-g',
      why: 'Han vil bytte jobb.',
      quote: 'Bartek søker ny jobb.',
    });
  });

  it('reads an unanswered row as unanswered rather than as a pick', () => {
    const verdict = readMultipleChoiceGroupVerdict({
      closed: false,
      locked: [],
      items: [{ itemId: 'r1', submitted: null, correct: false, firstAnswer: null }],
    });
    expect(verdict!.items[0].submitted).toBeNull();
    expect(verdict!.items[0].firstAnswer).toBeNull();
    // Counted from the items when the engine did not say — never guessed at zero.
    expect(verdict!.totalItems).toBe(1);
    expect(verdict!.passedItems).toBe(0);
  });

  // Guessing `closed` either way would strand the learner on a finished table or offer a
  // check the engine refuses, so a verdict without it is no verdict.
  it('refuses a verdict that does not say how the table now stands', () => {
    expect(readMultipleChoiceGroupVerdict({ locked: [], items: [] })).toBeNull();
    expect(readMultipleChoiceGroupVerdict({ closed: true })).toBeNull();
    expect(
      readMultipleChoiceGroupVerdict({ closed: true, items: [{ itemId: '', correct: true }] }),
    ).toBeNull();
    expect(
      readMultipleChoiceGroupVerdict({ closed: true, items: [{ itemId: 'r1' }] }),
    ).toBeNull();
    expect(readMultipleChoiceGroupVerdict(null)).toBeNull();
    expect(readMultipleChoiceGroupVerdict([])).toBeNull();
  });
});

describe('buildMultipleChoiceGroupSubmission', () => {
  it('sends the whole table, and nothing about the attempt', () => {
    expect(buildMultipleChoiceGroupSubmission({ r1: 'c-r', r2: 'c-g' })).toEqual({
      answers: { r1: 'c-r', r2: 'c-g' },
    });
  });

  it('adds `reveal` only when the student gave up on the retry', () => {
    expect(buildMultipleChoiceGroupSubmission({ r1: 'c-r' }, true)).toEqual({
      answers: { r1: 'c-r' },
      reveal: true,
    });
    expect(buildMultipleChoiceGroupSubmission({ r1: 'c-r' }, false).reveal).toBeUndefined();
  });
});

describe('unansweredCount', () => {
  const rows = [
    { id: 'r1', text: 'a' },
    { id: 'r2', text: 'b' },
  ];

  it('counts the rows still to answer', () => {
    expect(unansweredCount(rows, {})).toBe(2);
    expect(unansweredCount(rows, { r1: 'c-r' })).toBe(1);
    expect(unansweredCount(rows, { r1: 'c-r', r2: 'c-g' })).toBe(0);
  });

  it('ignores an answer for a row the table no longer holds', () => {
    expect(unansweredCount(rows, { r1: 'c-r', gone: 'c-g' })).toBe(1);
  });
});

describe('keepOnRetry', () => {
  const right = (id: string): MultipleChoiceGroupItemResult => ({
    itemId: id,
    submitted: 'c-r',
    correct: true,
    firstAnswer: 'c-r',
  });
  const wrong = (id: string): MultipleChoiceGroupItemResult => ({
    itemId: id,
    submitted: 'c-r',
    correct: false,
    firstAnswer: 'c-r',
  });

  it('keeps exactly the frozen rows when the server froze any', () => {
    expect(keepOnRetry({ r1: 'c-r', r2: 'c-g' }, ['r1'], [right('r1'), wrong('r2')])).toEqual({
      r1: 'c-r',
    });
  });

  // `lockCorrect: false` — the freeze is empty although a row came out right, and S3.5
  // keeps every answer, wrong ones included.
  it('keeps everything when nothing is frozen but something was right', () => {
    expect(keepOnRetry({ r1: 'c-r', r2: 'c-g' }, [], [right('r1'), wrong('r2')])).toEqual({
      r1: 'c-r',
      r2: 'c-g',
    });
  });

  // The one case the two readings of the handoff share: there is no correct answer to
  // keep either way, so the wrong picks are cleared (plan 54 §5, deviation 8).
  it('clears everything when nothing was right and nothing is frozen', () => {
    expect(keepOnRetry({ r1: 'c-r', r2: 'c-g' }, [], [wrong('r1'), wrong('r2')])).toEqual({});
  });

  it('does not invent an answer for a frozen row that has none', () => {
    expect(keepOnRetry({ r1: 'c-r' }, ['r1', 'r2'], [right('r1')])).toEqual({ r1: 'c-r' });
  });

  it('does not mutate the answers it was given', () => {
    const answers = { r1: 'c-r', r2: 'c-g' };
    keepOnRetry(answers, ['r1'], [right('r1'), wrong('r2')]);
    expect(answers).toEqual({ r1: 'c-r', r2: 'c-g' });
  });
});
