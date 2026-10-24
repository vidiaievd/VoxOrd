import type { MasteryVerdict } from '../api/masteryProfile';
import { splitVerdicts, STRONG_AT } from './splitVerdicts';

const cell = (successRateEwma: number, focus: MasteryVerdict['focus']): MasteryVerdict => ({
  skill: 'reading',
  focus,
  successRateEwma,
  reason: null,
  meanStability: null,
  medianSecondsPerItem: null,
  attempts: 12,
  weightedSample: 9,
  lastAttemptAt: '2026-09-02T10:00:00.000Z',
});

describe('splitVerdicts', () => {
  it('keeps the kernel’s weakest-first order in the weak block', () => {
    const { weak } = splitVerdicts([cell(0.2, 'grammar'), cell(0.5, 'vocabulary')]);

    expect(weak.map((v) => v.focus)).toEqual(['grammar', 'vocabulary']);
  });

  it('leads the strong block with the best cell', () => {
    const { strong } = splitVerdicts([cell(0.85, 'grammar'), cell(0.95, 'vocabulary')]);

    expect(strong.map((v) => v.focus)).toEqual(['vocabulary', 'grammar']);
  });

  it('treats the bar itself as strong, the way the can-do evaluator does', () => {
    const { strong, weak } = splitVerdicts([cell(STRONG_AT, 'grammar')]);

    expect(strong).toHaveLength(1);
    expect(weak).toHaveLength(0);
  });

  it('splits nothing into two empty blocks rather than guessing', () => {
    expect(splitVerdicts([])).toEqual({ strong: [], weak: [] });
  });
});
