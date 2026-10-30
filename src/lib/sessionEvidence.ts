import type { ReviewRating } from '../api/srs';
import {
  gradeWord,
  recordAttempt,
  type AttemptResult,
  type ModeOutcome,
  type SessionMode,
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
  mode: SessionMode,
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

/** How a single word's outcomes collapse into a rating, or into nothing. */
export type WordGrader = (outcomes: ModeOutcome[]) => ReviewRating | null;

/**
 * One rating per word with any usable evidence.
 *
 * Words the grader returns `null` for are dropped rather than defaulted: no
 * evidence means the word was only previewed or the session was abandoned
 * before it was answered, and the honest outcome there is to send nothing and
 * leave the card due.
 *
 * The grader is a parameter because personal decks score one mode course
 * reviews never see — pass `gradePersonalWord` for them (plan Step 9.4). The
 * ledger itself is identical either way, so it stays one implementation.
 */
export function gradeSession(
  evidence: SessionEvidence,
  grade: WordGrader = gradeWord,
): GradedWord[] {
  const graded: GradedWord[] = [];
  for (const [key, outcomes] of Object.entries(evidence.byWordId)) {
    const rating = grade(outcomes);
    if (rating === null) continue;
    graded.push({ wordId: Number(key), rating });
  }
  return graded;
}

/** Words that have produced at least one answer — for session progress UI. */
export function answeredCount(
  evidence: SessionEvidence,
  grade: WordGrader = gradeWord,
): number {
  return gradeSession(evidence, grade).length;
}

export interface PhaseScore {
  mode: SessionMode;
  /** Words answered in this mode. */
  total: number;
  /** Of those, right on the first try — no miss, no give-up. */
  correct: number;
}

/**
 * How each drilled mode went, for the session summary (Practice §7.5 «By phase»): per mode in
 * `modes` order, the words that got any answer there and those right first time. A mode with
 * no answers is left out — the preview never records any, and a phase can end empty.
 */
export function phaseBreakdown(
  evidence: SessionEvidence,
  modes: readonly SessionMode[],
): PhaseScore[] {
  const scores: PhaseScore[] = [];
  for (const mode of modes) {
    let total = 0;
    let correct = 0;
    for (const outcomes of Object.values(evidence.byWordId)) {
      const outcome = outcomes.find((o) => o.mode === mode);
      if (!outcome) continue;
      total += 1;
      if (outcome.eventuallyCorrect && outcome.failedAttempts === 0 && !outcome.gaveUp) {
        correct += 1;
      }
    }
    if (total > 0 && !scores.some((s) => s.mode === mode)) {
      scores.push({ mode, total, correct });
    }
  }
  return scores;
}
