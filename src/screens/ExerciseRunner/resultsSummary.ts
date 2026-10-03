import type { ItemResult } from './runnerMachine';

export interface ResultsSummary {
  total: number;
  correct: number;
  needsReview: number;
  incorrect: number;
  /** 0..1, correct-only (needsReview items aren't a pass or a fail yet). */
  accuracy: number;
  /**
   * 0..1, (correct + needsReview) / total — for tone/emoji. The templates that
   * go to a teacher (translate_*, writing_task) always come back `requiresReview`
   * and never `correct`, so scoring the hero purely on `accuracy` would make
   * a perfectly-completed writing set look like a failure; being routed for
   * review is a successful completion, not a wrong answer.
   */
  handledRatio: number;
  totalTimeSpentSeconds: number;
}

/**
 * Buckets each item's verdict into exactly one outcome. `requiresReview`
 * items are never auto-correct (the validators that route to review always
 * return `correct: false` alongside `requiresReview: true`), so
 * checking `correct` first is enough to keep the buckets disjoint.
 */
export function buildResultsSummary(results: ItemResult[]): ResultsSummary {
  let correct = 0;
  let needsReview = 0;
  let incorrect = 0;
  let totalTimeSpentSeconds = 0;

  for (const { verdict, timeSpentSeconds } of results) {
    totalTimeSpentSeconds += timeSpentSeconds;
    if (verdict.correct) correct += 1;
    else if (verdict.requiresReview) needsReview += 1;
    else incorrect += 1;
  }

  const total = results.length;
  return {
    total,
    correct,
    needsReview,
    incorrect,
    accuracy: total > 0 ? correct / total : 0,
    handledRatio: total > 0 ? (correct + needsReview) / total : 0,
    totalTimeSpentSeconds,
  };
}
