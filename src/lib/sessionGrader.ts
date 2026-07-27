import type { ReviewRating } from '../api/srs';

/**
 * Turns what the user actually did during a course review session into a
 * single FSRS rating per card.
 *
 * Why this exists: the server takes `AGAIN | HARD | GOOD | EASY` per card, but
 * asking the user to grade themselves was rejected (2026-07-27) — it is both a
 * skill most users lack and inconsistent with the rest of VoxOrd, which is
 * exercise-driven. So the rating is derived from measured performance instead.
 *
 * Two rules shape everything below:
 *
 * 1. **One rating per card per session.** A course session drills the same word
 *    through several modes; posting a review per mode would reschedule one card
 *    several times over (the server's idempotency key does NOT help — those are
 *    legitimately distinct events). Outcomes accumulate here and collapse into
 *    one rating at the end.
 *
 * 2. **Failing an easier mode is a stronger negative signal than failing a
 *    harder one.** Missing a 4-way choice of the native translation means the
 *    word is not known at all. Failing to *type* the target word is ordinary
 *    even for a well-known word — that is receptive knowledge without
 *    productive knowledge, which is `HARD`, not a lapse.
 *
 * No I/O here. Measured FSRS behaviour that motivated the thresholds is
 * recorded in docs/plans/course-integration-plan.md (step 8.1b).
 */

/**
 * Modes whose outcome is evidence of recall.
 *
 * Deliberately excluded:
 * - `flashcard` — `isCorrect` is `direction === 'right'` (useCard.ts), i.e.
 *   pure self-report. Scoring it would smuggle back the very self-assessment
 *   this design removes. It runs as a non-scoring preview for NEW cards.
 * - `matching` — the pool narrows as pairs are consumed, so the final pair is
 *   correct for free. "Correct" there is inflated.
 */
export type GradedMode = 'listening' | 'quiz' | 'context' | 'spelling';

/**
 * 4-way recognition of the *native translation* — the easiest real test.
 * A first-try miss here is the strongest negative signal available.
 */
const RECOGNITION_MODES: readonly GradedMode[] = ['quiz', 'listening'];

/** Free-text production of the target word — the hardest mode. */
const PRODUCTION_MODE: GradedMode = 'spelling';

export interface ModeOutcome {
  mode: GradedMode;
  /** Wrong answers before the eventual correct one. 0 = right first try. */
  failedAttempts: number;
  /** Whether the user ever got it right in this mode. */
  eventuallyCorrect: boolean;
  /** Spelling only: the first-letter hint was shown (after 2 mistakes). */
  hintUsed: boolean;
  /** Spelling only: the user pressed skip, i.e. gave up. */
  gaveUp: boolean;
}

export interface AttemptResult {
  correct: boolean;
  hintUsed?: boolean;
  gaveUp?: boolean;
}

/**
 * Folds one answer into the running per-mode outcome.
 *
 * A wrong answer requeues the word in quiz/listening/spelling, so the same mode
 * legitimately reports several attempts; they accumulate into one outcome
 * rather than becoming separate ones.
 */
export function recordAttempt(
  outcomes: ModeOutcome[],
  mode: GradedMode,
  result: AttemptResult,
): ModeOutcome[] {
  const existing = outcomes.find((o) => o.mode === mode);
  const base: ModeOutcome = existing ?? {
    mode,
    failedAttempts: 0,
    eventuallyCorrect: false,
    hintUsed: false,
    gaveUp: false,
  };

  const updated: ModeOutcome = {
    mode,
    // Once correct, later attempts in the same mode cannot un-earn it.
    failedAttempts: base.failedAttempts + (result.correct ? 0 : 1),
    eventuallyCorrect: base.eventuallyCorrect || result.correct,
    hintUsed: base.hintUsed || result.hintUsed === true,
    gaveUp: base.gaveUp || result.gaveUp === true,
  };

  return existing
    ? outcomes.map((o) => (o.mode === mode ? updated : o))
    : [...outcomes, updated];
}

/**
 * A mode that was presented but never answered (session abandoned mid-question)
 * carries no information — it must not be read as a failure.
 */
function hasEvidence(outcome: ModeOutcome): boolean {
  return outcome.eventuallyCorrect || outcome.failedAttempts > 0 || outcome.gaveUp;
}

function isFirstTry(outcome: ModeOutcome): boolean {
  return outcome.eventuallyCorrect && outcome.failedAttempts === 0;
}

/**
 * Collapses a session's outcomes for one card into a single rating.
 *
 * Returns `null` when there is nothing to judge (only a preview happened, or
 * the session was abandoned before any answer) — the caller must then send no
 * review event at all, leaving the card due.
 *
 * Rules are evaluated top-down; the first match wins.
 */
export function gradeWord(outcomes: ModeOutcome[]): ReviewRating | null {
  const graded = outcomes.filter(hasEvidence);
  if (graded.length === 0) return null;

  const spelling = graded.find((o) => o.mode === PRODUCTION_MODE);
  const recognition = graded.filter((o) => RECOGNITION_MODES.includes(o.mode));
  const context = graded.find((o) => o.mode === 'context');

  // 1. Gave up anywhere.
  if (graded.some((o) => o.gaveUp)) return 'AGAIN';

  // 2. Missed a 4-way choice of the translation → the word is not known.
  if (recognition.some((o) => !isFirstTry(o))) return 'AGAIN';

  // 3. Repeated failure to produce the word, or never produced it at all.
  if (spelling && (spelling.failedAttempts >= 2 || !spelling.eventuallyCorrect)) {
    return 'AGAIN';
  }

  // 4. Recognised the translation but not the target form in context.
  if (context && !isFirstTry(context)) return 'HARD';

  // 5. Produced it, but only with help or after one slip.
  if (spelling && (spelling.hintUsed || spelling.failedAttempts === 1)) return 'HARD';

  // 6. Flawless, and proven productively. EASY skips the learning phase
  //    entirely (measured: straight to REVIEW, ~8 days), so it demands the
  //    hardest mode as evidence — never awarded on recognition alone.
  if (spelling && !spelling.hintUsed && graded.every(isFirstTry)) return 'EASY';

  // 7. Correct, but without production evidence to justify a long jump.
  return 'GOOD';
}
