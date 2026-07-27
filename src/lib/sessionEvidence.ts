import type { ReviewRating } from '../api/srs';
import {
  gradeWord,
  recordAttempt,
  type AttemptResult,
  type GradedMode,
  type ModeOutcome,
} from './sessionGrader';

/**
 * Accumulates what happened to every word across a whole multi-mode course
 * session, then collapses it into at most one rating per word.
 *
 * `sessionGrader` grades a single word; this is the per-session ledger around
 * it. It exists because a course session drills the same word through several
 * modes and must post **exactly one** review event per card — posting per mode
 * would reschedule one card several times over, and the server's idempotency
 * key does not help since those are legitimately distinct events.
 *
 * Immutable so it can live directly in React state: every record returns a new
 * ledger. Keyed by local `wordId`; the caller maps that back to a `cardId`
 * through `courseReviewSet.cardIdForWord`.
 */

export interface SessionEvidence {
  readonly byWordId: Readonly<Record<number, ModeOutcome[]>>;
}

export function createEvidence(): SessionEvidence {
  return { byWordId: {} };
}

/**
 * Folds one answer in. Answers for words that are not graded (session padding)
 * should not reach here at all — the caller filters with
 * `courseReviewSet.isGraded`, so that the ledger only ever describes cards a
 * review will actually be posted for.
 */
export function recordWordAttempt(
  evidence: SessionEvidence,
  wordId: number,
  mode: GradedMode,
  result: AttemptResult,
): SessionEvidence {
  const current = evidence.byWordId[wordId] ?? [];
  return {
    byWordId: {
      ...evidence.byWordId,
      [wordId]: recordAttempt(current, mode, result),
    },
  };
}

export interface GradedWord {
  wordId: number;
  rating: ReviewRating;
}

/**
 * One rating per word with any usable evidence.
 *
 * Words `gradeWord` returns `null` for are dropped rather than defaulted: no
 * evidence means the word was only previewed or the session was abandoned
 * before it was answered, and the honest outcome there is to send nothing and
 * leave the card due.
 */
export function gradeSession(evidence: SessionEvidence): GradedWord[] {
  const graded: GradedWord[] = [];
  for (const [key, outcomes] of Object.entries(evidence.byWordId)) {
    const rating = gradeWord(outcomes);
    if (rating === null) continue;
    graded.push({ wordId: Number(key), rating });
  }
  return graded;
}

/** Words that have produced at least one answer — for session progress UI. */
export function answeredCount(evidence: SessionEvidence): number {
  return gradeSession(evidence).length;
}
