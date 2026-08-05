import type { SrsCard, SrsState } from './engine.port';

/**
 * Translation between a `word_progress` row and an `SrsCard`.
 *
 * Pure, so it can be tested without a database — the repository that uses it
 * cannot be, since `db/database.ts` opens SQLite at import time. Same division
 * as `legacyConversion.ts` and the v10 migration (plan Step 9.3).
 *
 * The eleven columns are `fsrs`-prefixed because `word_progress` already has a
 * `status` and a `lastReviewed` meaning something else entirely.
 */

/** Column names in the order `cardValues` emits them. */
export const FSRS_COLUMNS = [
  'fsrsState',
  'fsrsStability',
  'fsrsDifficulty',
  'fsrsDueAt',
  'fsrsReps',
  'fsrsLapses',
  'fsrsElapsedDays',
  'fsrsScheduledDays',
  'fsrsLearningSteps',
  'fsrsLastReviewedAt',
  'fsrsProfileId',
] as const;

const VALID_STATES: readonly string[] = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'];

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads the FSRS card out of a row, or `null` when the row does not hold one.
 *
 * `null` is the normal case for a freshly inserted row, not an error: the v10
 * backfill only converted rows that existed at migration time, while
 * `seedIfEmpty()` runs after migrations and the vocabulary importer inserts at
 * any time. A NULL `fsrsProfileId` therefore means "not an FSRS card yet", and
 * the caller must introduce a fresh card rather than read this as a card with
 * stability 0 — the distinction the v10 migration note calls out for Step 9.4.
 *
 * A row with a profile but an unrecognisable state is treated the same way. It
 * can only come from our own writes, so it means something is corrupt; starting
 * the card over is recoverable, whereas feeding a bogus state into the
 * scheduler is not.
 */
export function readCard(row: Record<string, unknown>): SrsCard | null {
  const profileId = row.fsrsProfileId;
  if (typeof profileId !== 'string' || profileId === '') return null;

  const state = row.fsrsState;
  if (typeof state !== 'string' || !VALID_STATES.includes(state)) {
    console.warn(
      `[SRS] word_progress row has profile "${profileId}" but state "${String(state)}" — treating it as a new card`,
    );
    return null;
  }

  const lastReviewedAt = row.fsrsLastReviewedAt;

  return {
    state: state as SrsState,
    stability: num(row.fsrsStability, 0),
    difficulty: num(row.fsrsDifficulty, 0),
    // A card with no due date is due now: the safe direction is to show it.
    dueAt: num(row.fsrsDueAt, 0),
    reps: num(row.fsrsReps, 0),
    lapses: num(row.fsrsLapses, 0),
    elapsedDays: num(row.fsrsElapsedDays, 0),
    scheduledDays: num(row.fsrsScheduledDays, 0),
    learningSteps: num(row.fsrsLearningSteps, 0),
    lastReviewedAt:
      typeof lastReviewedAt === 'number' && Number.isFinite(lastReviewedAt)
        ? lastReviewedAt
        : null,
    profileId,
  };
}

/** Card fields as bind values, in `FSRS_COLUMNS` order. */
export function cardValues(card: SrsCard): Array<string | number | null> {
  return [
    card.state,
    card.stability,
    card.difficulty,
    card.dueAt,
    card.reps,
    card.lapses,
    card.elapsedDays,
    card.scheduledDays,
    card.learningSteps,
    card.lastReviewedAt,
    card.profileId,
  ];
}

/** `fsrsState = ?, fsrsStability = ?, …` for an UPDATE, matching `cardValues`. */
export const FSRS_SET_CLAUSE = FSRS_COLUMNS.map((c) => `${c} = ?`).join(', ');
