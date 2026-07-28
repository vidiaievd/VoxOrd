/**
 * The stable SRS contract. Call sites depend on this file, never on `ts-fsrs`
 * directly — only `fsrs-adapter.ts` imports the library, so a library upgrade
 * (or a swap to a different scheduler) is a one-file change here.
 *
 * Times are **epoch milliseconds** throughout, matching how VoxOrd already
 * stores them (`word_progress.nextReview`, `lastReviewed`). The server's
 * equivalent port uses `Date`; the adapter converts at the boundary.
 */

export type SrsRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

/**
 * Card lifecycle states. Mirrors learning-service's `ReviewCardState` minus
 * `SUSPENDED`, which is a server-side concept with no local counterpart.
 */
export type SrsState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';

export interface SrsCard {
  state: SrsState;
  /** Memory stability in days. 0 for a card that has never been reviewed. */
  stability: number;
  /** Item difficulty, roughly 1..10. 0 before the first review. */
  difficulty: number;
  /** Epoch ms when the card next comes due. */
  dueAt: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  /** Epoch ms of the last review, or null if never reviewed. */
  lastReviewedAt: number | null;
  /**
   * The parameter profile that produced these numbers. A card read with a
   * different profile than the engine's is NOT to be trusted blindly — see
   * `SrsEngine.profileId` and the migration note in the Phase 9 plan.
   */
  profileId: string;
}

export interface SrsPrediction {
  rating: SrsRating;
  scheduledDays: number;
  /** Epoch ms the card would come due at if this rating were given. */
  dueAt: number;
}

export interface SrsEngine {
  /** The profile these computations use; stamped onto every card produced. */
  readonly profileId: string;

  /** A brand-new, never-reviewed card, due immediately. */
  introduce(now: number): SrsCard;

  /**
   * Apply a rating and return the rescheduled card. `reps` always increments;
   * `lapses` increments only when a REVIEW-state card is rated AGAIN — this
   * mirrors learning-service's `ReviewCard.review()` exactly, so the two sides
   * count lapses the same way.
   */
  review(card: SrsCard, rating: SrsRating, reviewedAt: number): SrsCard;

  /** Recall probability 0..1 per the forgetting curve. NEW cards return 0. */
  retrievability(card: SrsCard, now: number): number;

  /** What each of the four ratings would do to this card, for UI preview. */
  predict(card: SrsCard, now: number): SrsPrediction[];
}
