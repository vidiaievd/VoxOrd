import {
  buildGapFillAnswer,
  freeBankSlots,
  gapFillCanSubmit,
  readGapFillTask,
  readGapVerdicts,
  readRevealedGaps,
} from './wordBankGapFill';

// The projection content-service serves on /display, trimmed from a seeded exercise.
const SERVED = {
  sentences: [
    {
      id: 's1',
      tokens: [
        { kind: 'text', text: 'Bartek' },
        { kind: 'text', text: 'leser' },
        { kind: 'gap', gapKey: 's1#2', label: 'G1', before: '', after: '' },
        { kind: 'text', text: 'på' },
        { kind: 'text', text: 'nettet.' },
      ],
    },
    {
      id: 's2',
      tokens: [
        { kind: 'text', text: 'Anne' },
        { kind: 'text', text: 'finner' },
        { kind: 'gap', gapKey: 's2#2', label: 'G2', before: '', after: ',' },
        { kind: 'text', text: 'og' },
        { kind: 'gap', gapKey: 's2#4', label: 'G3', before: '', after: '.' },
      ],
      hint: 'Substantiv',
    },
  ],
  bank: ['retter', 'stillingsannonser', 'skrivefeil', 'førerkort'],
  settings: { allowReuse: false, showBankCount: true, input: 'bank' },
};

describe('readGapFillTask', () => {
  it('reads the served projection', () => {
    const task = readGapFillTask(SERVED);
    expect(task.gapKeys).toEqual(['s1#2', 's2#2', 's2#4']);
    expect(task.bank).toEqual(['retter', 'stillingsannonser', 'skrivefeil', 'førerkort']);
    expect(task.sentences[1].hint).toBe('Substantiv');
    expect(task.sentences[1].tokens[2]).toEqual({
      kind: 'gap',
      gapKey: 's2#2',
      label: 'G2',
      before: '',
      after: ',',
    });
    expect(task.allowReuse).toBe(false);
    expect(task.showBankCount).toBe(true);
  });

  it('has no bank in free-input mode', () => {
    expect(readGapFillTask({ ...SERVED, bank: null, settings: { input: 'free' } }).bank).toBeNull();
    expect(readGapFillTask({ ...SERVED, settings: { input: 'free' } }).bank).toBeNull();
  });

  it('drops tokens it cannot read and survives a non-document', () => {
    const task = readGapFillTask({
      sentences: [{ id: 's1', tokens: [{ kind: 'gap' }, { kind: 'weird' }, { kind: 'text', text: 'Hei' }] }],
    });
    expect(task.sentences[0].tokens).toEqual([{ kind: 'text', text: 'Hei' }]);
    expect(task.gapKeys).toEqual([]);
    expect(readGapFillTask(null).sentences).toEqual([]);
  });
});

describe('answer', () => {
  const keys = ['a', 'b'];

  it('sends one trimmed placement per filled gap', () => {
    expect(buildGapFillAnswer(keys, { a: ' retter ', b: '' })).toEqual({
      placements: [{ gapKey: 'a', word: 'retter' }],
    });
  });

  it('can be submitted only with every gap filled', () => {
    expect(gapFillCanSubmit(keys, { a: 'x' })).toBe(false);
    expect(gapFillCanSubmit(keys, { a: 'x', b: '  ' })).toBe(false);
    expect(gapFillCanSubmit(keys, { a: 'x', b: 'y' })).toBe(true);
    expect(gapFillCanSubmit([], {})).toBe(false);
  });
});

describe('freeBankSlots', () => {
  it('spends one copy of a word per gap it fills', () => {
    expect(freeBankSlots(['en', 'to', 'en'], { a: 'en' }, false)).toEqual([false, true, true]);
    expect(freeBankSlots(['en', 'to', 'en'], { a: 'en', b: 'en' }, false)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('spends nothing when words may be reused', () => {
    expect(freeBankSlots(['en', 'to'], { a: 'en', b: 'to' }, true)).toEqual([true, true]);
  });
});

describe('server responses', () => {
  it('reads per-gap verdicts from the check details', () => {
    expect(
      readGapVerdicts({
        totalGaps: 2,
        correctGaps: 1,
        gaps: [
          { gapKey: 'a', correct: true, explanation: null },
          { gapKey: 'b', correct: false, explanation: 'Нужен глагол.' },
          { gapKey: 'c' },
        ],
      }),
    ).toEqual({
      a: { correct: true, explanation: null },
      b: { correct: false, explanation: 'Нужен глагол.' },
    });
    expect(readGapVerdicts(undefined)).toEqual({});
  });

  it('reads the revealed answers', () => {
    expect(
      readRevealedGaps({
        attemptId: 'x',
        templateCode: 'word_bank_gap_fill',
        answers: [
          { gapKey: 'a', label: 'G1', word: 'retter', why: 'Å rette — исправлять.' },
          { gapKey: 'b', label: 'G2', word: 'skrivefeil', why: null },
        ],
        attemptClosed: true,
      }),
    ).toEqual({
      a: { word: 'retter', why: 'Å rette — исправлять.' },
      b: { word: 'skrivefeil', why: null },
    });
  });
});
