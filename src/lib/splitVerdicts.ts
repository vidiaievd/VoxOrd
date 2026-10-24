import type { MasteryVerdict } from '../api/masteryProfile';

/*
 * Port of the web's `features/mastery/lib/split-verdicts.ts` (mobile redesign 02, step 5).
 */

/**
 * Where «this is going well» starts.
 *
 * 0.8, taken from `CAN_DO_MASTERY_THRESHOLD` in learning-service, which took it from
 * `GRAMMAR_RULE_MASTERY_THRESHOLD` (plan 21 §2.2): a learner «achieved» on a can-do descriptor
 * and «still weak» on the profile the same afternoon is the platform contradicting itself.
 * A display bar, not a rule of the profile — the kernel returns one ordered list, and cutting
 * it into blocks is presentation.
 */
export const STRONG_AT = 0.8;

export interface SplitVerdicts {
  /** Strongest first — read as «what is working». */
  strong: MasteryVerdict[];
  /** Weakest first, as the kernel ordered them. */
  weak: MasteryVerdict[];
}

/**
 * Cut the kernel's one ordered list into two blocks: the weak list keeps the kernel's
 * weakest-first order, the strong one is reversed so the best cell leads. Neither is
 * truncated — how many a surface has room for is the surface's business.
 */
export function splitVerdicts(
  verdicts: readonly MasteryVerdict[],
  strongAt: number = STRONG_AT,
): SplitVerdicts {
  const strong: MasteryVerdict[] = [];
  const weak: MasteryVerdict[] = [];

  for (const verdict of verdicts) {
    (verdict.successRateEwma >= strongAt ? strong : weak).push(verdict);
  }

  strong.sort((a, b) => b.successRateEwma - a.successRateEwma);
  return { strong, weak };
}
