import type { ColorScheme } from '../../theme/colors';
import type { IconName } from './Icon';

/**
 * Where an answer stands — the option, slot, tile or cell a learner picked or filled.
 * Courses §8.5: no success/error colours; the right answer is lit with the accent, a wrong
 * one is dimmed.
 *
 * - `idle`     — nothing chosen yet.
 * - `selected` — chosen, not checked.
 * - `right`    — checked and right (or the key, revealed).
 * - `missed`   — the key the learner did not pick: shown, but not filled.
 * - `near`     — checked, close but not right (a typo, a partial match).
 * - `wrong`    — checked, picked and wrong.
 * - `rest`     — checked, neither picked nor the key.
 */
export type AnswerState =
  | 'idle'
  | 'selected'
  | 'right'
  | 'missed'
  | 'near'
  | 'wrong'
  | 'rest';

export interface AnswerTone {
  border: string;
  /** `transparent` where the state has no fill. */
  bg: string;
  fg: string;
  icon: IconName | null;
  iconColor: string;
}

export function answerTone(
  colors: ColorScheme,
  state: AnswerState,
): AnswerTone {
  switch (state) {
    case 'selected':
      return {
        border: colors.accentBase,
        bg: colors.accent900,
        fg: colors.text,
        icon: null,
        iconColor: colors.accent300,
      };
    case 'right':
      return {
        border: colors.accentBase,
        bg: colors.accent900,
        fg: colors.text,
        icon: 'Check',
        iconColor: colors.accent300,
      };
    case 'missed':
      return {
        border: colors.accentBase,
        bg: 'transparent',
        fg: colors.text,
        icon: 'Check',
        iconColor: colors.accent300,
      };
    case 'near':
      return {
        border: colors.accent700,
        bg: 'transparent',
        fg: colors.text,
        icon: null,
        iconColor: colors.accent300,
      };
    case 'wrong':
      return {
        border: colors.neutral600,
        bg: 'transparent',
        fg: colors.neutral400,
        icon: 'X',
        iconColor: colors.neutral400,
      };
    case 'rest':
      return {
        border: colors.neutral800,
        bg: 'transparent',
        fg: colors.neutral500,
        icon: null,
        iconColor: colors.neutral500,
      };
    case 'idle':
    default:
      return {
        border: colors.neutral700,
        bg: 'transparent',
        fg: colors.text,
        icon: null,
        iconColor: colors.neutral400,
      };
  }
}

/**
 * The colour of a verdict's headline (a banner, a score, a ✓ mark): a pass is lit, anything
 * short of it is dimmed — never green or red.
 */
export function verdictColor(colors: ColorScheme, passed: boolean): string {
  return passed ? colors.accent300 : colors.neutral400;
}
