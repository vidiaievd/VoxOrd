import { isPassedVerdict } from '../../lib/mistakes';
import type { ItemResult } from './runnerMachine';

export type ResultsTone = 'Excellent' | 'Good' | 'Okay' | 'KeepGoing' | 'HandedIn';

/** The title by the share checked right on the spot; `null` (nothing checked) is `HandedIn`. */
export function toneOf(accuracy: number | null): ResultsTone {
  if (accuracy === null) return 'HandedIn';
  return accuracy >= 0.9 ? 'Excellent' : accuracy >= 0.7 ? 'Good' : accuracy >= 0.5 ? 'Okay' : 'KeepGoing';
}

export interface ResultsSummary {
  total: number;
  correct: number;
  needsReview: number;
  incorrect: number;
  /**
   * 0..1 over the items checked on the spot (correct + incorrect); `null` when none was — a set
   * of handed-in work only. needsReview items are neither a pass nor a fail yet, so they stay out
   * of the denominator too (courses handoff, principle 3): counted in, a writing set read «0%».
   */
  accuracy: number | null;
  /**
   * The results title. Read off what was checked on the spot only: work still with a reviewer
   * is not passed yet — a model may already have said «needs more work» (OQ-110) — so it can
   * neither earn «Excellent!» nor drag the title down. A set of handed-in work only is
   * `HandedIn`: it was sent, nothing more is known.
   */
  tone: ResultsTone;
  totalTimeSpentSeconds: number;
  /** The exercises handed in for review, in set order, each once — the «Under review» row. */
  reviewIds: string[];
  /** The exercises answered wrong, in set order, each once — a «try again» row apiece. */
  wrongIds: string[];
  /**
   * Who the handed-in work waits for (plan 79's `reviewer`). An attempt closed as `none` waits
   * for nobody; an engine that does not say is read as a teacher, as before plan 79.
   */
  waitingTeacher: number;
  waitingAi: number;
}

/**
 * Buckets each item's verdict into exactly one outcome. `requiresReview`
 * items are never auto-correct (the validators that route to review always
 * return `correct: false` alongside `requiresReview: true`, and no `passed`), so
 * checking `isPassedVerdict` first is enough to keep the buckets disjoint. A set over the
 * pass mark with an item wrong counts as right here: it passed.
 */
export function buildResultsSummary(results: ItemResult[]): ResultsSummary {
  let correct = 0;
  let needsReview = 0;
  let incorrect = 0;
  let totalTimeSpentSeconds = 0;
  let waitingTeacher = 0;
  let waitingAi = 0;
  const reviewIds: string[] = [];
  const wrongIds: string[] = [];

  for (const { exerciseId, verdict, timeSpentSeconds } of results) {
    totalTimeSpentSeconds += timeSpentSeconds;
    if (isPassedVerdict(verdict)) correct += 1;
    else if (verdict.requiresReview) {
      needsReview += 1;
      if (!reviewIds.includes(exerciseId)) reviewIds.push(exerciseId);
      if (verdict.reviewer === 'ai') waitingAi += 1;
      else if (verdict.reviewer !== 'none') waitingTeacher += 1;
    } else {
      incorrect += 1;
      if (!wrongIds.includes(exerciseId)) wrongIds.push(exerciseId);
    }
  }

  const total = results.length;
  const accuracy = correct + incorrect > 0 ? correct / (correct + incorrect) : null;
  return {
    total,
    correct,
    needsReview,
    incorrect,
    accuracy,
    tone: toneOf(accuracy),
    totalTimeSpentSeconds,
    reviewIds,
    wrongIds,
    waitingTeacher,
    waitingAi,
  };
}

/** A set's time as the results tile shows it — m:ss. */
export function formatSetTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
