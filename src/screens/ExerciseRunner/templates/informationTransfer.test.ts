import {
  buildInformationTransferSubmission,
  canCheck,
  cellState,
  closingVerdict,
  counts,
  failures,
  keepOnRetry,
  markKey,
  readInformationTransferProjection,
  readInformationTransferVerdict,
  requiredHeld,
  setCell,
  valuesFromVerdict,
} from './informationTransfer';

/** A deep copy of plain JSON — Hermes' types have no `structuredClone`. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A blank as content-service sends it: no key, no reasons, no pass mark. */
const projection = {
  title: 'Legetime',
  instruction: 'Fyll ut skjemaet.',
  sourceKind: 'text',
  language: 'nb',
  passageTitle: 'Melding',
  passage: 'Du har time hos legen klokken 14.30.',
  form: { formTitle: 'Timebestilling', layout: 'form' },
  fields: [
    {
      id: 'f1',
      label: 'Klokkeslett',
      type: 'time',
      unit: '',
      placeholder: 'tt:mm',
      numeric: true,
    },
    {
      id: 'f2',
      label: '',
      type: 'word',
      unit: 'kr',
      placeholder: '',
      numeric: false,
      hint: 'Én ord',
    },
  ],
  answering: {
    showSource: 'always',
    oneAtATime: false,
    attempts: 2,
    revealKey: 'afterLastAttempt',
    hintsAfter: 9,
  },
};

const details = {
  totalItems: 2,
  passedItems: 1,
  correctNow: 1,
  pct: 50,
  passed: false,
  passPct: 70,
  missedRequired: 0,
  attempt: 1,
  checksLeft: 1,
  closed: false,
  revealed: false,
  locked: ['f1'],
  items: [
    {
      itemId: 'f1',
      value: '14.30',
      verdict: 'format',
      correct: true,
      canonical: '14:30',
    },
    {
      itemId: 'f2',
      value: 'lege',
      verdict: 'wrong',
      correct: false,
      why: 'Se på siste linje.',
    },
  ],
};

describe('readInformationTransferProjection', () => {
  it('reads the projection and fills what is missing', () => {
    const blank = readInformationTransferProjection(projection);
    expect(blank).not.toBeNull();
    expect(blank!.fields).toHaveLength(2);
    expect(blank!.fields[0]!.numeric).toBe(true);
    expect(blank!.fields[1]!.hint).toBe('Én ord');
    expect(blank!.passage).toContain('klokken 14.30');
    expect(blank!.answering.attempts).toBe(2);
  });

  it.each([
    ['expected on a field', (p: any) => (p.fields[0].expected = ['14:30'])],
    ['why on a field', (p: any) => (p.fields[0].why = 'x')],
    ['required on a field', (p: any) => (p.fields[0].required = true)],
    ['focus on a field', (p: any) => (p.fields[0].focus = 'x')],
    ['the pass mark', (p: any) => (p.answering.passPct = 70)],
    ['a grading block', (p: any) => (p.grading = {})],
    ['a scoring block', (p: any) => (p.scoring = {})],
    ['a transcript', (p: any) => (p.transcript = 'x')],
    ['expected answers', (p: any) => (p.expectedAnswers = {})],
    ['a text source without its text', (p: any) => (p.passage = ' ')],
    ['an unknown source', (p: any) => (p.sourceKind = 'video')],
    ['an unknown field type', (p: any) => (p.fields[0].type = 'colour')],
  ])('refuses a blank with %s', (_name, mutate) => {
    const bad = clone(projection);
    mutate(bad);
    expect(readInformationTransferProjection(bad)).toBeNull();
  });

  it('does not need a passage for a recording', () => {
    const rec: any = clone(projection);
    rec.sourceKind = 'audio';
    delete rec.passage;
    expect(readInformationTransferProjection(rec)).not.toBeNull();
  });

  it('reads an out-of-range budget as one check', () => {
    const odd: any = clone(projection);
    odd.answering.attempts = 9;
    expect(readInformationTransferProjection(odd)!.answering.attempts).toBe(1);
    odd.answering.attempts = 0;
    expect(readInformationTransferProjection(odd)!.answering.attempts).toBe(0);
  });
});

describe('readInformationTransferVerdict', () => {
  it('reads a check', () => {
    const v = readInformationTransferVerdict(details)!;
    expect(v.closed).toBe(false);
    expect(v.locked).toEqual(['f1']);
    expect(v.items[0]!.canonical).toBe('14:30');
    expect(v.checksLeft).toBe(1);
  });

  it('reads unlimited checks as null', () => {
    const v = readInformationTransferVerdict({ ...details, checksLeft: null })!;
    expect(v.checksLeft).toBeNull();
  });

  it.each([
    ['no closed', { ...details, closed: undefined }],
    ['no passed', { ...details, passed: undefined }],
    ['no items', { ...details, items: undefined }],
    [
      'an unknown cell verdict',
      {
        ...details,
        items: [{ itemId: 'f1', correct: true, verdict: 'maybe' }],
      },
    ],
    [
      'an item without a correct flag',
      { ...details, items: [{ itemId: 'f1', verdict: 'ok' }] },
    ],
  ])('refuses a verdict with %s', (_name, bad) => {
    expect(readInformationTransferVerdict(bad)).toBeNull();
  });

  it('copies a key only when it arrived', () => {
    const v = readInformationTransferVerdict(details)!;
    expect('canonical' in v.items[1]!).toBe(false);
    expect(v.items[1]!.why).toBe('Se på siste linje.');
  });
});

describe('what goes up and what a retry keeps', () => {
  const verdict = readInformationTransferVerdict(details)!;

  it('sends every filled cell, frozen ones too, and nothing else', () => {
    expect(
      buildInformationTransferSubmission({ f1: '14.30', f2: '  ', f3: 'x' }),
    ).toEqual({
      cells: { f1: '14.30', f3: 'x' },
    });
  });

  it('does not change a frozen cell', () => {
    const values = { f1: '14.30' };
    expect(setCell(values, ['f1'], 'f1', 'x')).toBe(values);
    expect(setCell(values, [], 'f2', 'lege')).toEqual({
      f1: '14.30',
      f2: 'lege',
    });
    expect(setCell({ f2: 'a' }, [], 'f2', '')).toEqual({});
  });

  it('checks only when a cell the server has not frozen is filled', () => {
    const { fields } = readInformationTransferProjection(projection)!;
    expect(canCheck(fields, { f1: '14.30' }, ['f1'])).toBe(false);
    expect(canCheck(fields, { f1: '14.30', f2: 'x' }, ['f1'])).toBe(true);
    expect(canCheck(fields, {}, [])).toBe(false);
  });

  it('empties exactly the cells found wrong and leaves work in progress', () => {
    expect(keepOnRetry({ f1: '14.30', f2: 'lege' }, verdict, ['f1'])).toEqual({
      f1: '14.30',
    });
    // f2 changed since the check: neither right nor wrong, so it stays.
    expect(keepOnRetry({ f1: '14.30', f2: 'lege2' }, verdict, ['f1'])).toEqual({
      f1: '14.30',
      f2: 'lege2',
    });
  });

  it('restores the cells of a resumed check', () => {
    expect(valuesFromVerdict(verdict)).toEqual({ f1: '14.30', f2: 'lege' });
  });

  it('counts the cells not counted', () => {
    expect(failures(verdict).map(i => i.itemId)).toEqual(['f2']);
    expect(failures(null)).toEqual([]);
  });
});

describe('how a cell reads', () => {
  const verdict = readInformationTransferVerdict(details)!;
  const out = (id: string) => verdict.items.find(i => i.itemId === id);

  it('draws the four states', () => {
    expect(cellState('f1', {}, undefined, ['f1'])).toBe('ok');
    expect(cellState('f1', {}, out('f1'), [])).toBe('ok');
    expect(cellState('f2', {}, out('f2'), [])).toBe('bad');
    expect(cellState('f2', { f2: 'x' }, undefined, [])).toBe('filled');
    expect(cellState('f2', {}, undefined, [])).toBe('empty');
  });

  it('counts three verdicts and marks five ways', () => {
    expect(
      ['ok', 'format', 'typo', 'unread', 'empty', 'wrong'].map(v =>
        counts(v as never),
      ),
    ).toEqual([true, true, true, false, false, false]);
    expect(markKey('format')).toBe('ok');
    expect(markKey('typo')).toBe('typo');
    expect(markKey('wrong')).toBe('wrong');
  });

  it('names a missed required cell only when it is what failed a good percentage', () => {
    expect(requiredHeld({ ...verdict, pct: 80, missedRequired: 1 })).toBe(true);
    expect(requiredHeld({ ...verdict, pct: 50, missedRequired: 1 })).toBe(
      false,
    );
    expect(
      requiredHeld({ ...verdict, passed: true, pct: 80, missedRequired: 1 }),
    ).toBe(false);
  });

  it('records the engine\'s pass, not "every cell right now"', () => {
    expect(
      closingVerdict({ correct: false }, { ...verdict, passed: true }).correct,
    ).toBe(true);
    expect(
      closingVerdict({ correct: true }, { ...verdict, passed: false }).correct,
    ).toBe(false);
  });
});
