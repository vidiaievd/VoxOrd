import { estimateMinutes, forecastLine, sourceBreakdown } from './practice';

describe('estimateMinutes', () => {
  it('rounds 20 s a card up, never below a minute', () => {
    expect(estimateMinutes(0)).toBe(1);
    expect(estimateMinutes(1)).toBe(1);
    expect(estimateMinutes(3)).toBe(1);
    expect(estimateMinutes(4)).toBe(2);
    expect(estimateMinutes(18)).toBe(6);
  });

  it('survives a negative count', () => {
    expect(estimateMinutes(-5)).toBe(1);
  });
});

describe('sourceBreakdown', () => {
  it('keeps the fixed order and drops empty and unknown parts', () => {
    expect(
      sourceBreakdown({ exercises: 2, courseWords: 12, myWords: 0, rules: null }),
    ).toEqual([
      { key: 'courseWords', count: 12 },
      { key: 'exercises', count: 2 },
    ]);
  });

  it('is empty when nothing is known', () => {
    expect(sourceBreakdown({})).toEqual([]);
  });
});

describe('forecastLine', () => {
  const now = new Date(2026, 9, 28, 15, 0); // Wed 28 Oct 2026, local

  it('names tomorrow, then the next weekday with something due', () => {
    expect(
      forecastLine(
        [
          { date: '2026-10-28', count: 5 },
          { date: '2026-10-29', count: 9 },
          { date: '2026-10-30', count: 0 },
          { date: '2026-10-31', count: 21 },
        ],
        now,
      ),
    ).toEqual([
      { when: 'tomorrow', count: 9 },
      { when: 'weekday', weekday: 6, count: 21 },
    ]);
  });

  it('takes at most two and sorts by date', () => {
    const parts = forecastLine(
      [
        { date: '2026-11-02', count: 1 },
        { date: '2026-10-30', count: 2 },
        { date: '2026-10-31', count: 3 },
      ],
      now,
    );
    expect(parts.map(p => p.count)).toEqual([2, 3]);
  });

  it('is empty without a forecast or with nothing ahead', () => {
    expect(forecastLine(undefined, now)).toEqual([]);
    expect(forecastLine([{ date: '2026-10-28', count: 4 }], now)).toEqual([]);
    expect(forecastLine([{ date: 'garbage', count: 4 }], now)).toEqual([]);
  });
});
