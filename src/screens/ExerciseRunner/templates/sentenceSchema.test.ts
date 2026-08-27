import {
  buildSentenceSchemaSubmission,
  canCheckRow,
  firstEmptyField,
  isSentenceSchemaDocument,
  keepCorrect,
  placeItem,
  placedItems,
  readSentenceSchemaResult,
  readSentenceSchemaSet,
  takeItem,
  type SentenceSchemaField,
  type SentenceSchemaResult,
} from './sentenceSchema';

/** A projection as content-service's `studentSafeContent` sends it. */
const projection = (over: Record<string, unknown> = {}): unknown => ({
  title: 'Leddsetninger',
  instruction: 'Sett ordene på riktig plass.',
  rows: [
    {
      id: 'r1',
      clause: 'sub',
      fields: [
        { id: 'sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
        { id: 'subj', short: 'S', label: 'Subjekt', hint: 'Hvem gjør det', optional: false },
        { id: 'adv', short: 'a', label: 'Setningsadverbial', hint: '', optional: true },
      ],
      bank: [
        { id: 'c2', text: 'hun' },
        { id: 'c1', text: 'at' },
        { id: 'c3', text: 'ikke' },
      ],
      source: 'Hun kommer ikke.',
      counts: null,
      start: {},
    },
  ],
  settings: { labels: true, hints: true, perField: true, orderOnly: false },
  ...over,
});

const fields: SentenceSchemaField[] = [
  { id: 'f1', short: 'F', label: 'Forfelt', hint: '', optional: false },
  { id: 'f2', short: 'v', label: 'Verbal', hint: '', optional: false },
];

describe('isSentenceSchemaDocument', () => {
  it('is a set when `rows` is an array, empty or not', () => {
    expect(isSentenceSchemaDocument({ rows: [] })).toBe(true);
    expect(isSentenceSchemaDocument(projection())).toBe(true);
  });

  it('is not a set for a pre-plan-52 document, which has fields and tokens instead', () => {
    expect(isSentenceSchemaDocument({ sentence: 'Han kommer.', fields: [], tokens: [] })).toBe(false);
    expect(isSentenceSchemaDocument(null)).toBe(false);
    expect(isSentenceSchemaDocument('rows')).toBe(false);
  });
});

describe('readSentenceSchemaSet', () => {
  it('reads a projection whole, keeping the bank in the order the server shuffled it', () => {
    const set = readSentenceSchemaSet(projection());

    expect(set).not.toBeNull();
    expect(set!.rows).toHaveLength(1);
    expect(set!.rows[0].bank.map((item) => item.id)).toEqual(['c2', 'c1', 'c3']);
    expect(set!.rows[0].source).toBe('Hun kommer ikke.');
    expect(set!.rows[0].fields[2].optional).toBe(true);
    expect(set!.settings).toEqual({ labels: true, hints: true, perField: true, orderOnly: false });
  });

  it('falls back to the kernel defaults for settings it was not sent', () => {
    const set = readSentenceSchemaSet(projection({ settings: undefined }));

    expect(set!.settings).toEqual({
      labels: true,
      hints: false,
      perField: true,
      orderOnly: false,
    });
  });

  it('refuses a row carrying its chunks — `chunk.field` is the whole answer', () => {
    const withKey = projection({
      rows: [{ id: 'r1', clause: 'sub', fields: [], bank: [], chunks: [{ id: 'c1', field: 'sub' }] }],
    });
    expect(readSentenceSchemaSet(withKey)).toBeNull();
  });

  it('refuses a row carrying `text` — the sentence in its correct order is the answer', () => {
    const withText = projection({
      rows: [{ id: 'r1', clause: 'sub', fields: [], bank: [], text: 'at hun ikke kommer' }],
    });
    expect(readSentenceSchemaSet(withText)).toBeNull();
  });

  it('refuses a row carrying the teacher’s explanations', () => {
    const base = { id: 'r1', clause: 'sub', fields: [], bank: [] };
    expect(readSentenceSchemaSet(projection({ rows: [{ ...base, why: 'V2' }] }))).toBeNull();
    expect(readSentenceSchemaSet(projection({ rows: [{ ...base, fb: {} }] }))).toBeNull();
  });

  it('refuses a bank piece that says which field it belongs in', () => {
    const leaky = projection({
      rows: [
        {
          id: 'r1',
          clause: 'sub',
          fields: [],
          bank: [{ id: 'c1', text: 'at', field: 'sub' }],
        },
      ],
    });
    expect(readSentenceSchemaSet(leaky)).toBeNull();
    expect(
      readSentenceSchemaSet(
        projection({
          rows: [{ id: 'r1', clause: 'sub', fields: [], bank: [{ id: 'c1', text: 'at', alt: [] }] }],
        }),
      ),
    ).toBeNull();
  });

  it('refuses a document that is not a set at all', () => {
    expect(readSentenceSchemaSet({ sentence: 'Han kommer.', tokens: [] })).toBeNull();
    expect(readSentenceSchemaSet(null)).toBeNull();
    expect(readSentenceSchemaSet([])).toBeNull();
  });

  it('refuses a field or a row without an id — that is a document, not a projection', () => {
    expect(
      readSentenceSchemaSet(
        projection({ rows: [{ clause: 'sub', fields: [], bank: [], counts: null, start: {} }] }),
      ),
    ).toBeNull();
    expect(
      readSentenceSchemaSet(
        projection({
          rows: [{ id: 'r1', clause: 'sub', fields: [{ short: 'S' }], bank: [], start: {} }],
        }),
      ),
    ).toBeNull();
  });

  it('reads the sequence-only board: one nameless field, and no clause worth naming', () => {
    const orderOnly = projection({
      rows: [
        {
          id: 'r1',
          clause: 'main',
          fields: [{ id: '__order', short: '', label: '', hint: '', optional: false }],
          bank: [{ id: 'c1', text: 'Han' }],
          source: '',
          counts: null,
          start: {},
        },
      ],
      settings: { orderOnly: true },
    });

    const set = readSentenceSchemaSet(orderOnly);
    expect(set!.rows[0].fields).toHaveLength(1);
    expect(set!.rows[0].fields[0].short).toBe('');
    expect(set!.settings.orderOnly).toBe(true);
  });

  it('keeps counts only where the server sent numbers, and a missing map stays null', () => {
    const counted = projection({
      rows: [
        {
          id: 'r1',
          clause: 'sub',
          fields: [],
          bank: [],
          counts: { sub: 1, subj: 'two' },
          start: { sub: ['c1'], subj: 7 },
        },
      ],
    });

    const row = readSentenceSchemaSet(counted)!.rows[0];
    expect(row.counts).toEqual({ sub: 1 });
    expect(row.start).toEqual({ sub: ['c1'] });
    expect(readSentenceSchemaSet(projection())!.rows[0].counts).toBeNull();
  });
});

describe('readSentenceSchemaResult', () => {
  const marks = (over: Record<string, unknown> = {}): unknown => ({
    rowId: 'r1',
    attempt: 2,
    byItem: { c1: 'ok', c2: 'field', c3: 'order' },
    byField: { sub: 'ok', subj: 'bad' },
    wrong: 2,
    solved: false,
    score: 33,
    why: null,
    text: null,
    solution: null,
    banner: { source: 'default', text: '', code: 'order', hint: 'V2' },
    ...over,
  });

  it('reads the marks the server sent', () => {
    const read = readSentenceSchemaResult(marks());

    expect(read).not.toBeNull();
    expect(read!.byItem).toEqual({ c1: 'ok', c2: 'field', c3: 'order' });
    expect(read!.byField).toEqual({ sub: 'ok', subj: 'bad' });
    expect(read!.attempt).toBe(2);
    expect(read!.banner).toEqual({ source: 'default', text: '', code: 'order', hint: 'V2' });
  });

  it('keeps `byField` null where per-field marking is off — the verdict still stands', () => {
    const read = readSentenceSchemaResult(marks({ byField: null }));
    expect(read!.byField).toBeNull();
    expect(read!.wrong).toBe(2);
  });

  it('carries the key only once the sentence is closed', () => {
    const closed = readSentenceSchemaResult(
      marks({ solved: true, why: 'V2', text: 'at hun ikke kommer', solution: { sub: ['c1'] } }),
    );
    expect(closed!.text).toBe('at hun ikke kommer');
    expect(closed!.solution).toEqual({ sub: ['c1'] });
    expect(readSentenceSchemaResult(marks())!.text).toBeNull();
  });

  it('drops marks it does not understand rather than colouring pieces nobody judged', () => {
    const read = readSentenceSchemaResult(marks({ byItem: { c1: 'ok', c2: 'nonsense' } }));
    expect(read!.byItem).toEqual({ c1: 'ok' });
  });

  it('refuses a result with no sentence and no verdict', () => {
    expect(readSentenceSchemaResult(marks({ rowId: '' }))).toBeNull();
    expect(readSentenceSchemaResult(marks({ solved: undefined }))).toBeNull();
    expect(readSentenceSchemaResult(null)).toBeNull();
  });

  it('drops a note with neither words nor a code — an empty box reads as a failure', () => {
    expect(readSentenceSchemaResult(marks({ banner: { source: 'why', text: '', code: null } }))!.banner)
      .toBeNull();
    expect(readSentenceSchemaResult(marks({ banner: { source: 'nope', text: 'hm' } }))!.banner)
      .toBeNull();
  });
});

describe('moving pieces', () => {
  it('places a piece and lifts it out of wherever it was', () => {
    const first = placeItem({}, 'f1', 'c1');
    expect(first).toEqual({ f1: ['c1'] });

    const moved = placeItem(first, 'f2', 'c1');
    // The empty field is gone rather than kept as an empty array: `{f1: []}` and no `f1`
    // must not be two different boards.
    expect(moved).toEqual({ f2: ['c1'] });
  });

  it('stacks in the order pieces were placed — order inside a field is graded', () => {
    const board = placeItem(placeItem({}, 'f1', 'c1'), 'f1', 'c2');
    expect(board.f1).toEqual(['c1', 'c2']);
  });

  it('takes a piece back to the bank', () => {
    expect(takeItem({ f1: ['c1', 'c2'] }, 'c1')).toEqual({ f1: ['c2'] });
    expect(takeItem({ f1: ['c1'] }, 'c1')).toEqual({});
  });

  it('finds the first empty field in board order, and none when the board is full', () => {
    expect(firstEmptyField(fields, {})).toBe('f1');
    expect(firstEmptyField(fields, { f1: ['c1'] })).toBe('f2');
    expect(firstEmptyField(fields, { f1: ['c1'], f2: ['c2'] })).toBeNull();
  });

  it('lists what is on the board, and refuses to check an empty one', () => {
    expect(placedItems({ f1: ['c1'], f2: ['c2', 'c3'] })).toEqual(['c1', 'c2', 'c3']);
    expect(canCheckRow({})).toBe(false);
    expect(canCheckRow({ f1: ['c1'] })).toBe(true);
  });
});

describe('keepCorrect', () => {
  const marks: SentenceSchemaResult = {
    rowId: 'r1',
    attempt: 1,
    byItem: { c1: 'ok', c2: 'field', c3: 'ok', c4: 'order' },
    byField: null,
    wrong: 2,
    solved: false,
    score: 50,
    why: null,
    text: null,
    solution: null,
    banner: null,
  };

  it('keeps every piece the server marked right and clears the rest', () => {
    expect(keepCorrect({ f1: ['c1', 'c2'], f2: ['c3', 'c4'] }, marks)).toEqual({
      f1: ['c1'],
      f2: ['c3'],
    });
  });

  it('drops a field whose pieces were all wrong rather than leaving it empty', () => {
    expect(keepCorrect({ f1: ['c2'], f2: ['c3'] }, marks)).toEqual({ f2: ['c3'] });
  });

  it('keeps nothing when nothing was right — an unmarked piece is not a right one', () => {
    expect(keepCorrect({ f1: ['c9'] }, marks)).toEqual({});
  });
});

describe('buildSentenceSchemaSubmission', () => {
  it('sends every board, and no verdict with them', () => {
    const submission = buildSentenceSchemaSubmission([
      { rowId: 'r1', placement: { f1: ['c1'] }, revealed: false },
      { rowId: 'r2', placement: {}, revealed: true },
    ]);

    expect(submission).toEqual({
      rows: [
        { rowId: 'r1', placement: { f1: ['c1'] }, revealed: false },
        { rowId: 'r2', placement: {}, revealed: true },
      ],
    });
  });
});
