import type { SrsCard, SrsEngine, SrsState } from './engine.port';

/**
 * One-time conversion from the retired 6-stage `SpacedRepetition` model to an
 * FSRS card (course-integration plan, Step 9.3).
 *
 * The conversion is **lossy and one-directional**: the 6-stage model tracked a
 * stage plus two strength scalars, FSRS tracks stability/difficulty on a
 * forgetting curve, and there is no way back. The old columns are therefore
 * left in place rather than dropped, so rollback is "stop reading the new
 * ones".
 *
 * | 6-stage input        | FSRS output                                        |
 * |----------------------|----------------------------------------------------|
 * | stage 0, or never reviewed | a fresh NEW card, due now                    |
 * | stage 1 (1h) / 2 (8h)| LEARNING, at learning step 1 / 2                   |
 * | stage 3-5 (1d/3d/7d) | REVIEW                                             |
 * | the stage's interval | `stability`, in days — see below                   |
 * | successCount / reviewCount | `difficulty`, interpolated — see below       |
 * | `nextReview`         | `dueAt` (kept as-is, so an overdue word stays overdue) |
 * | `reviewCount`        | `reps`                                             |
 * | failures             | `lapses`                                           |
 *
 * **Why the stage's interval becomes `stability` directly:** in FSRS,
 * stability *is* the number of days for recall probability to fall to 90%, and
 * the profile schedules at `requestRetention = 0.9`. So a word the old engine
 * had earned a 3-day interval for becomes a card FSRS will also schedule at
 * roughly 3 days. The two models disagree about much, but this one quantity
 * means the same thing in both, which makes it the honest hinge to convert on.
 *
 * **Difficulty** is interpolated by success rate between the two initial
 * difficulties the engine itself assigns — AGAIN's (hardest) and GOOD's — so a
 * word answered correctly every time starts no easier than a fresh GOOD card.
 * EASY's initial difficulty is deliberately not the upper anchor: it clamps to
 * FSRS's floor of 1, which no amount of 6-stage history is good enough to earn.
 */

/**
 * The retired engine's intervals per stage, in days. Copied from
 * `learning-engine/SpacedRepetition.ts` — that file is deleted in Step 9.4, so
 * the numbers are restated here rather than imported.
 */
const LEGACY_STAGE_DAYS: Record<number, number> = {
  0: 0,
  1: 1 / 24, // 1 hour
  2: 8 / 24, // 8 hours
  3: 1,
  4: 3,
  5: 7,
};

export interface LegacyWordProgress {
  memoryStage: number;
  /** Epoch ms, or null when the word was never scheduled. */
  nextReview: number | null;
  /** Epoch ms, or null when the word was never reviewed. */
  lastReviewed: number | null;
  reviewCount: number;
  successCount: number;
}

export interface DifficultyAnchors {
  /** Initial difficulty the engine assigns a card rated AGAIN — the hardest. */
  hardest: number;
  /** Initial difficulty the engine assigns a card rated GOOD. */
  easiest: number;
}

/**
 * Reads the two initial difficulties out of the engine instead of hardcoding
 * them, so the anchors follow the profile's weights rather than drifting from
 * them silently.
 */
export function difficultyAnchors(engine: SrsEngine, now: number): DifficultyAnchors {
  const fresh = engine.introduce(now);
  return {
    hardest: engine.review(fresh, 'AGAIN', now).difficulty,
    easiest: engine.review(fresh, 'GOOD', now).difficulty,
  };
}

function stateForStage(stage: number): SrsState {
  if (stage <= 0) return 'NEW';
  // Stages 1-2 have sub-day intervals, which is what FSRS calls the learning
  // phase; from stage 3 (1 day) the old engine was doing spaced review.
  if (stage <= 2) return 'LEARNING';
  return 'REVIEW';
}

function learningStepForStage(stage: number): number {
  // The profile has two learning steps ('1m', '10m'); a card past them sits at
  // index 2. Stage 1 is one step in, stage 2 is through them.
  if (stage === 1) return 1;
  if (stage === 2) return 2;
  return 0;
}

/**
 * Converts one row. Returns a fresh NEW card whenever there is no usable
 * history, rather than inventing stability from nothing.
 */
export function convertLegacyProgress(
  legacy: LegacyWordProgress,
  anchors: DifficultyAnchors,
  profileId: string,
  now: number,
): SrsCard {
  const stage = Math.max(0, Math.min(5, Math.trunc(legacy.memoryStage)));
  const reviewCount = Math.max(0, legacy.reviewCount);

  // A stage above 0 with no review ever recorded is inconsistent data; treat
  // the review history as the authority and start clean.
  const hasHistory = stage > 0 && reviewCount > 0 && legacy.lastReviewed !== null;

  if (!hasHistory) {
    return {
      state: 'NEW',
      stability: 0,
      difficulty: 0,
      dueAt: now,
      reps: 0,
      lapses: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      lastReviewedAt: null,
      profileId,
    };
  }

  const successCount = Math.max(0, Math.min(reviewCount, legacy.successCount));
  const successRate = successCount / reviewCount;
  const stageDays = LEGACY_STAGE_DAYS[stage];

  return {
    state: stateForStage(stage),
    stability: stageDays,
    difficulty: anchors.hardest - successRate * (anchors.hardest - anchors.easiest),
    // An overdue word stays overdue; a word that was never scheduled is due now.
    dueAt: legacy.nextReview ?? now,
    reps: reviewCount,
    // The old engine had no lapse concept — every wrong answer dropped a stage,
    // which is its closest analogue. FSRS does not feed lapses into scheduling
    // (verified), so this only affects what the number reports.
    lapses: reviewCount - successCount,
    // Both are recomputed by FSRS from `lastReviewedAt` on the next review;
    // seeding scheduledDays keeps the row self-describing in the meantime.
    elapsedDays: 0,
    scheduledDays: stageDays,
    learningSteps: learningStepForStage(stage),
    lastReviewedAt: legacy.lastReviewed,
    profileId,
  };
}

/** Convenience wrapper for callers that hold an engine rather than anchors. */
export function convertLegacyProgressWith(
  legacy: LegacyWordProgress,
  engine: SrsEngine,
  now: number,
): SrsCard {
  return convertLegacyProgress(legacy, difficultyAnchors(engine, now), engine.profileId, now);
}
