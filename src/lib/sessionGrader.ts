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
 * Self-reported, not measured: `isCorrect` is `direction === 'right'`
 * (`useCard.ts`) — nothing is ever compared against the answer.
 *
 * It exists as a mode of its own because personal decks offer flashcards as a
 * standalone activity ("Self Assessment" in `ModeSelector`, and the whole of
 * `CardScreen`), so treating it as pure practice would leave those sessions
 * unable to schedule anything at all. `gradePersonalWord` therefore accepts it,
 * but only as a last resort and never above `GOOD` — see there. Course reviews
 * never record it: the flashcard phase is a non-scoring preview for NEW cards.
 */
export type SelfReportMode = 'flashcard';

/** Every mode an outcome can be recorded for. */
export type SessionMode = GradedMode | SelfReportMode;

const SELF_REPORT_MODE: SelfReportMode = 'flashcard';

function isPerformanceOutcome(outcome: ModeOutcome): boolean {
  return outcome.mode !== SELF_REPORT_MODE;
}

/**
 * 4-way recognition of the *native translation* — the easiest real test.
 * A first-try miss here is the strongest negative signal available.
 */
const RECOGNITION_MODES: readonly SessionMode[] = ['quiz', 'listening'];

/** Free-text production of the target word — the hardest mode. */
const PRODUCTION_MODE: GradedMode = 'spelling';

export interface ModeOutcome {
  mode: SessionMode;
  /** Wrong answers before the eventual correct one. 0 = right first try. */
  failedAttempts: number;
  /** Whether the user ever got it right in this mode. */
  eventuallyCorrect: boolean;
  /** Spelling only: the first-letter hint was shown (after 2 mistakes). */
  hintUsed: boolean;
  /** Spelling only: the user pressed skip, i.e. gave up. */
  gaveUp: boolean;
  /**
   * Spelling only: an answer was accepted as a near-miss (see
   * `answerMatching`). Recall was there, production was imperfect — a weaker
   * signal than a clean success, but nothing like a lapse.
   */
  typoed: boolean;
}

export interface AttemptResult {
  correct: boolean;
  hintUsed?: boolean;
  gaveUp?: boolean;
  typo?: boolean;
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
  mode: SessionMode,
  result: AttemptResult,
): ModeOutcome[] {
  const existing = outcomes.find((o) => o.mode === mode);
  const base: ModeOutcome = existing ?? {
    mode,
    failedAttempts: 0,
    eventuallyCorrect: false,
    hintUsed: false,
    gaveUp: false,
    typoed: false,
  };

  const updated: ModeOutcome = {
    mode,
    // Once correct, later attempts in the same mode cannot un-earn it.
    failedAttempts: base.failedAttempts + (result.correct ? 0 : 1),
    eventuallyCorrect: base.eventuallyCorrect || result.correct,
    hintUsed: base.hintUsed || result.hintUsed === true,
    gaveUp: base.gaveUp || result.gaveUp === true,
    typoed: base.typoed || result.typo === true,
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
 * Collapses a session's outcomes for one card into a single rating, using
 * **measured performance only** — `flashcard` outcomes are discarded here even
 * if present.
 *
 * Returns `null` when there is nothing to judge (only a preview happened, or
 * the session was abandoned before any answer) — the caller must then send no
 * review event at all, leaving the card due.
 *
 * Rules are evaluated top-down; the first match wins.
 */
export function gradeWord(outcomes: ModeOutcome[]): ReviewRating | null {
  const graded = outcomes.filter(isPerformanceOutcome).filter(hasEvidence);
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

  // 5. Produced it, but only with help, with a near-miss, or after one slip.
  if (
    spelling &&
    (spelling.hintUsed || spelling.typoed || spelling.failedAttempts === 1)
  ) {
    return 'HARD';
  }

  // 6. Flawless, and proven productively. EASY skips the learning phase
  //    entirely (measured: straight to REVIEW, ~8 days), so it demands the
  //    hardest mode as evidence — never awarded on recognition alone.
  if (spelling && !spelling.hintUsed && !spelling.typoed && graded.every(isFirstTry)) {
    return 'EASY';
  }

  // 7. Correct, but without production evidence to justify a long jump.
  return 'GOOD';
}

/**
 * The personal-deck counterpart of `gradeWord` (plan Step 9.4).
 *
 * Personal words are scheduled by the on-device FSRS engine rather than by the
 * server, and they reach it through activities course reviews never use: the
 * standalone `flashcard` mode. Two rules, in this order:
 *
 * 1. **Measured performance always wins.** If the session produced any evidence
 *    from a real test, self-report is discarded outright — it adds nothing and
 *    could only dilute a harder signal. This is what makes Deep Session behave
 *    identically to a course session even though its first phase is flashcards
 *    (`PHASE_ORDER` in `useDeepSession`), including keeping `EASY` reachable:
 *    rule 6's "every mode first-try" is never held hostage by a swipe.
 *
 * 2. **Self-report alone can move a card, but never far.** A flashcard-only
 *    session caps at `GOOD` — `EASY` skips the learning phase entirely
 *    (measured: straight to REVIEW at ~8 days), and no self-assessment should
 *    buy that. A swipe left is taken at face value as `AGAIN`: the unreliable
 *    half of self-report is the claim of knowing, not the admission of not
 *    knowing, and an unnecessary extra review is the safe direction to err in.
 *
 * Why grade self-report at all, having rejected it for course words (2026-07-27):
 * that rejection was about *asking the user to rate an FSRS card* inside an
 * auto-graded review. Here the swipe is a mode the user deliberately chose,
 * labelled "Self Assessment", and the previous 6-stage engine already advanced
 * a stage on exactly this signal — so scoring it is parity, not a new demand on
 * the user. `matching` stays unscored, for the reason it always was: the pool
 * narrows as pairs are consumed, so the last pair is correct for free.
 */
export function gradePersonalWord(outcomes: ModeOutcome[]): ReviewRating | null {
  const measured = gradeWord(outcomes);
  if (measured !== null) return measured;

  const selfReport = outcomes.find(
    (o) => o.mode === SELF_REPORT_MODE && hasEvidence(o),
  );
  if (!selfReport) return null;

  // A single "I didn't know it" outweighs any later claim to the contrary.
  return selfReport.failedAttempts > 0 ? 'AGAIN' : 'GOOD';
}
