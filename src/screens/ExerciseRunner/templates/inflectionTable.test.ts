import {
  askedKeys,
  buildInflectionTableSubmission,
  canCheck,
  cellKey,
  cellState,
  closingVerdict,
  failures,
  keepOnRetry,
  readInflectionTableProjection,
  readInflectionTableVerdict,
  rowChip,
  setCell,
  type InflectionTableVerdict,
} from './inflectionTable';

/** A deep copy of plain JSON — Hermes' types have no `structuredClone`. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A projection as content-service sends it: no form in an asked cell, no reason, no pass mark. */
const projection = {
  instruction: 'Fyll ut tabellen.',
  language: 'nb',
  paradigm: { id: 'noun', label: 'Substantiv', lemmaLabel: 'Ubestemt entall' },
  slots: [
    { id: 'indefSg', label: 'Ubestemt entall', short: 'ub. ent.' },
    { id: 'defSg', label: 'Bestemt entall', short: 'be. ent.' },
    { id: 'indefPl', label: 'Ubestemt flertall' },
  ],
  rows: [
    {
      id: 'r1',
      lemma: 'en jobb',
      gloss: 'a job',
      cells: {
        indefSg: { mode: 'prefill', value: 'en jobb' },
        defSg: { mode: 'ask' },
        indefPl: { mode: 'ask', hint: 'j' },
      },
    },
    {
      id: 'r2',
      lemma: 'ei bok',
      gloss: 'a book',
      cells: {
        indefSg: { mode: 'prefill', value: 'ei bok' },
        defSg: { mode: 'ask' },
        indefPl: { mode: 'ask' },
      },
    },
  ],
  settings: {
    input: 'type',
    attempts: 2,
    revealKey: 'afterLast',
    rowVerdict: true,
  },
};

/** A first check: `jobben` right, `jobber` empty, `boka` right, `boker` near on the diacritic. */
const firstCheck = {
  totalItems: 4,
  passedItems: 2,
  correctNow: 2,
  falsePositives: 0,
  pct: 50,
  passed: false,
  attempt: 1,
  checksLeft: 1,
  closed: false,
  locked: ['r1:defSg', 'r2:defSg'],
  rows: [
    { rowId: 'r1', asked: 2, ok: 1, firstOk: 1 },
    { rowId: 'r2', asked: 2, ok: 1, firstOk: 1 },
  ],
  items: [
    {
      itemId: 'r1:defSg',
      rowId: 'r1',
      slotId: 'defSg',
      value: 'jobben',
      correct: true,
      firstCorrect: true,
      firstAnswer: 'jobben',
    },
    {
      itemId: 'r1:indefPl',
      rowId: 'r1',
      slotId: 'indefPl',
      value: '',
      correct: false,
      firstCorrect: false,
      firstAnswer: '',
      why: 'Én-stavelses hankjønn får -er.',
    },
    {
      itemId: 'r2:defSg',
      rowId: 'r2',
      slotId: 'defSg',
      value: 'boka',
      correct: true,
      firstCorrect: true,
      firstAnswer: 'boka',
    },
    {
      itemId: 'r2:indefPl',
      rowId: 'r2',
      slotId: 'indefPl',
      value: 'boker',
      correct: false,
      firstCorrect: false,
      firstAnswer: 'boker',
      near: 'diacritic',
    },
  ],
};

describe('readInflectionTableProjection', () => {
  it('reads the projection, filling a missing short label with the full one', () => {
    const table = readInflectionTableProjection(projection);
    expect(table).not.toBeNull();
    expect(table!.slots[2]).toEqual({
      id: 'indefPl',
      label: 'Ubestemt flertall',
      short: 'Ubestemt flertall',
    });
    expect(table!.rows[0].cells.indefPl).toEqual({ mode: 'ask', hint: 'j' });
    expect(table!.rows[0].cells.defSg).toEqual({ mode: 'ask' });
    expect(table!.settings).toEqual({
      input: 'type',
      attempts: 2,
      revealKey: 'afterLast',
      rowVerdict: true,
    });
    expect(table!.bank).toBeUndefined();
  });

  it('refuses an asked cell carrying its form (IT-X2)', () => {
    const leaky = clone(projection);
    (leaky.rows[0].cells.defSg as Record<string, unknown>).value = 'jobben';
    expect(readInflectionTableProjection(leaky)).toBeNull();
  });

  it.each([
    [
      'accept on a cell',
      (p: any) => (p.rows[1].cells.defSg.accept = ['boken']),
    ],
    ['why on a cell', (p: any) => (p.rows[1].cells.defSg.why = 'Hunkjønn')],
    ['dictId on a row', (p: any) => (p.rows[0].dictId = 'd1')],
    ['the pass mark', (p: any) => (p.settings.threshold = 80)],
    ['the key column', (p: any) => (p.expectedAnswers = {})],
  ])('refuses %s', (_name, mutate) => {
    const leaky = clone(projection);
    mutate(leaky);
    expect(readInflectionTableProjection(leaky)).toBeNull();
  });

  it('refuses a table of one column, or a bank-mode table without a bank', () => {
    const narrow = clone(projection);
    narrow.slots = narrow.slots.slice(0, 1);
    expect(readInflectionTableProjection(narrow)).toBeNull();

    const bankless = clone(projection);
    bankless.settings.input = 'bank';
    expect(readInflectionTableProjection(bankless)).toBeNull();
  });

  it('reads the bank in bank mode, and reads an out-of-range budget as one check', () => {
    const banked = { ...clone(projection), bank: ['boker', 'jobber', 'bøker'] };
    banked.settings = {
      ...banked.settings,
      input: 'bank',
      attempts: 9,
    } as typeof banked.settings;
    const table = readInflectionTableProjection(banked);
    expect(table!.bank).toEqual(['boker', 'jobber', 'bøker']);
    expect(table!.settings.attempts).toBe(1);
  });

  it('drops a cell under a slot the table does not have', () => {
    const extra = clone(projection);
    (extra.rows[0].cells as Record<string, unknown>).gone = { mode: 'ask' };
    expect(
      Object.keys(readInflectionTableProjection(extra)!.rows[0].cells),
    ).not.toContain('gone');
  });
});

describe('askedKeys', () => {
  it('lists the asked cells row by row, never a given one', () => {
    const table = readInflectionTableProjection(projection)!;
    expect(askedKeys(table)).toEqual([
      'r1:defSg',
      'r1:indefPl',
      'r2:defSg',
      'r2:indefPl',
    ]);
    expect(cellKey('r1', 'defSg')).toBe('r1:defSg');
  });
});

describe('readInflectionTableVerdict', () => {
  it('reads a check, keeping only the key parts that arrived', () => {
    const verdict = readInflectionTableVerdict(firstCheck)!;
    expect(verdict.closed).toBe(false);
    expect(verdict.locked).toEqual(['r1:defSg', 'r2:defSg']);
    expect(verdict.items[3]).toEqual({
      itemId: 'r2:indefPl',
      rowId: 'r2',
      slotId: 'indefPl',
      value: 'boker',
      correct: false,
      firstCorrect: false,
      firstAnswer: 'boker',
      near: 'diacritic',
    });
    expect(verdict.items[3]).not.toHaveProperty('correctForm');
    expect(verdict.items[1].why).toBe('Én-stavelses hankjønn får -er.');
  });

  it('refuses a verdict that does not say whether the table is closed or passed', () => {
    const noClosed: Record<string, unknown> = clone(firstCheck);
    delete noClosed.closed;
    expect(readInflectionTableVerdict(noClosed)).toBeNull();
    const noPassed: Record<string, unknown> = clone(firstCheck);
    delete noPassed.passed;
    expect(readInflectionTableVerdict(noPassed)).toBeNull();
  });

  it('drops a near miss it does not know', () => {
    const odd = clone(firstCheck);
    (odd.items[3] as Record<string, unknown>).near = 'something';
    expect(readInflectionTableVerdict(odd)!.items[3]).not.toHaveProperty(
      'near',
    );
  });
});

describe('the answer', () => {
  it('sends every filled cell, frozen ones included, and nothing about the attempt', () => {
    expect(
      buildInflectionTableSubmission({
        'r1:defSg': 'jobben',
        'r2:indefPl': 'bøker',
        'r1:indefPl': '  ',
      }),
    ).toEqual({ cells: { 'r1:defSg': 'jobben', 'r2:indefPl': 'bøker' } });
  });

  it('will not change a frozen cell, and empties on null or an empty string', () => {
    const values = { 'r1:defSg': 'jobben', 'r2:indefPl': 'boker' };
    expect(setCell(values, ['r1:defSg'], 'r1:defSg', 'jobb')).toBe(values);
    expect(setCell(values, [], 'r2:indefPl', null)).toEqual({
      'r1:defSg': 'jobben',
    });
    expect(setCell(values, [], 'r2:indefPl', '')).toEqual({
      'r1:defSg': 'jobben',
    });
    expect(setCell(values, [], 'r1:indefPl', 'jobber')).toEqual({
      ...values,
      'r1:indefPl': 'jobber',
    });
  });

  it('offers Check only for a filled cell that is not frozen', () => {
    const keys = ['r1:defSg', 'r1:indefPl'];
    expect(canCheck(keys, {}, [])).toBe(false);
    expect(canCheck(keys, { 'r1:defSg': ' ' }, [])).toBe(false);
    expect(canCheck(keys, { 'r1:defSg': 'jobben' }, ['r1:defSg'])).toBe(false);
    expect(
      canCheck(keys, { 'r1:defSg': 'jobben', 'r1:indefPl': 'j' }, ['r1:defSg']),
    ).toBe(true);
  });
});

describe('the retry', () => {
  it('empties exactly the wrong cells, keeping frozen ones and cells changed since the check (IT-R4)', () => {
    const verdict = readInflectionTableVerdict(
      firstCheck,
    ) as InflectionTableVerdict;
    const values = {
      'r1:defSg': 'jobben',
      'r2:defSg': 'boka',
      'r2:indefPl': 'boker',
      // Left empty at the check, typed into since — the student's work in progress.
      'r1:indefPl': 'jobber',
    };
    expect(keepOnRetry(values, verdict, verdict.locked)).toEqual({
      'r1:defSg': 'jobben',
      'r2:defSg': 'boka',
      'r1:indefPl': 'jobber',
    });
  });
});

describe('how the table is drawn', () => {
  const verdict = readInflectionTableVerdict(
    firstCheck,
  ) as InflectionTableVerdict;

  it('draws four cell states from the verdict, the freeze and the values', () => {
    expect(cellState('r1:defSg', {}, null, [])).toBe('empty');
    expect(cellState('r1:defSg', { 'r1:defSg': 'jobben' }, null, [])).toBe(
      'filled',
    );
    expect(
      cellState(
        'r2:indefPl',
        { 'r2:indefPl': 'boker' },
        verdict,
        verdict.locked,
      ),
    ).toBe('bad');
    expect(
      cellState('r2:defSg', { 'r2:defSg': 'boka' }, verdict, verdict.locked),
    ).toBe('ok');
    // After a retry the verdict is gone and the freeze stays.
    expect(
      cellState('r2:defSg', { 'r2:defSg': 'boka' }, null, verdict.locked),
    ).toBe('ok');
    expect(cellState('r2:indefPl', {}, null, verdict.locked)).toBe('empty');
  });

  it('chips a row by how many of its asked cells are right, only under rowVerdict', () => {
    expect(rowChip(verdict, true, 'r1')).toEqual({
      tone: 'part',
      ok: 1,
      asked: 2,
    });
    expect(rowChip(verdict, false, 'r1')).toBeNull();
    expect(rowChip(null, true, 'r1')).toBeNull();

    const allRight = clone(firstCheck);
    allRight.rows[0].ok = 2;
    allRight.rows[1].ok = 0;
    const v = readInflectionTableVerdict(allRight)!;
    expect(rowChip(v, true, 'r1')!.tone).toBe('all');
    expect(rowChip(v, true, 'r2')!.tone).toBe('none');
  });

  it('lists the wrong cells for the report', () => {
    expect(failures(verdict).map(f => f.itemId)).toEqual([
      'r1:indefPl',
      'r2:indefPl',
    ]);
    expect(failures(null)).toEqual([]);
  });
});

describe('closingVerdict', () => {
  it('records the pass, not «every cell right»', () => {
    const passedAt75 = readInflectionTableVerdict({
      ...firstCheck,
      passed: true,
      closed: true,
    })!;
    const response = { attemptId: 'a1', correct: false, score: 75 };
    expect(closingVerdict(response, passedAt75)).toEqual({
      attemptId: 'a1',
      correct: true,
      score: 75,
    });
  });
});
