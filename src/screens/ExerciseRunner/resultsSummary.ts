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
   * go to a teacher (writing_task always, translate_* unless every sentence hits the
   * key) come back `requiresReview` rather than `correct`, so scoring the hero purely on `accuracy` would make
   * a perfectly-completed writing set look like a failure; being routed for
   * review is a successful completion, not a wrong answer.
   */
  handledRatio: number;
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
 * return `correct: false` alongside `requiresReview: true`), so
 * checking `correct` first is enough to keep the buckets disjoint.
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
    if (verdict.correct) correct += 1;
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
  return {
    total,
    correct,
    needsReview,
    incorrect,
    accuracy: total > 0 ? correct / total : 0,
    handledRatio: total > 0 ? (correct + needsReview) / total : 0,
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
