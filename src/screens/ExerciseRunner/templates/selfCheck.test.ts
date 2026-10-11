import { readCorrectionSelfCheck, readTranslateSelfCheck, selfCheckBudget } from './selfCheck';

describe('selfCheckBudget', () => {
  it('is the author budget, 2 by default, 0 with the machine check off, clamped to 0–5', () => {
    expect(selfCheckBudget({})).toBe(2);
    expect(selfCheckBudget({ flow: { selfCheck: 3 } })).toBe(3);
    expect(selfCheckBudget({ flow: { selfCheck: 50 } })).toBe(5);
    expect(selfCheckBudget({ flow: { selfCheck: 3 }, check: { on: false } })).toBe(0);
    expect(selfCheckBudget(null)).toBe(2);
  });
});

describe('readTranslateSelfCheck', () => {
  it('reads verdicts, masked diffs and the task rules', () => {
    const read = readTranslateSelfCheck({
      attemptId: 'x',
      checksUsed: 1,
      checksLeft: 1,
      templateCode: 'translate_to_target',
      passing: 1,
      items: [
        { itemId: 's1', verdict: 'exact', sim: 1, tokens: [{ t: 'eq', w: 'Jeg', typo: null }], missing: [], banned: [] },
        {
          itemId: 's2',
          verdict: 'near',
          sim: 0.8,
          tokens: [
            { t: 'eq', w: 'Det', typo: null },
            { t: 'missing', w: '•••', typo: null },
            { t: 'extra', w: 'men', typo: null },
          ],
          missing: [{ text: 'Likevel ga', note: 'Inversjon.' }],
          banned: [],
        },
        { itemId: 's3', verdict: 'off', sim: 0.2, divergingWords: 4, missing: [], banned: [{ text: 'Derfor jeg' }] },
        { verdict: 'exact' },
      ],
    });
    expect(read.checksLeft).toBe(1);
    expect(read.passing).toBe(1);
    expect(Object.keys(read.items)).toEqual(['s1', 's2', 's3']);
    expect(read.items.s2.tokens?.map((token) => token.t)).toEqual(['eq', 'missing', 'extra']);
    expect(read.items.s2.missing).toEqual([{ text: 'Likevel ga', note: 'Inversjon.' }]);
    expect(read.items.s3).toEqual({ verdict: 'off', divergingWords: 4, missing: [], banned: [{ text: 'Derfor jeg' }] });
  });
});

describe('readCorrectionSelfCheck', () => {
  it('reads counts per sentence', () => {
    const read = readCorrectionSelfCheck({
      checksLeft: 0,
      fixedCount: 2,
      spanCount: 3,
      items: [
        { itemId: 's-0', fixedCount: 1, spanCount: 1, fixedSpans: [true], strayEdits: 0 },
        { itemId: 's-2', fixedCount: 1, spanCount: 2, fixedSpans: [true, false], remainingTypes: ['order'], strayEdits: 1 },
      ],
    });
    expect(read).toEqual({
      checksLeft: 0,
      fixedCount: 2,
      spanCount: 3,
      items: {
        's-0': { fixedCount: 1, spanCount: 1, strayEdits: 0 },
        's-2': { fixedCount: 1, spanCount: 2, remainingTypes: ['order'], strayEdits: 1 },
      },
    });
  });
});
