import type { AttemptResult } from '../lib/sessionGrader';

/**
 * Optional per-answer instrumentation for the word exercises.
 *
 * Added for course review sessions (step 8.1b): a course word is a server FSRS
 * card, so its rating must be derived from what actually happened across every
 * mode in the session. The exercises previously reported only
 * `onComplete(correctCount)`, which cannot express "got it on the second try"
 * or "asked for a hint" — and retries live in an internal queue ref, so a
 * requeued word is indistinguishable from a first-try success after the fact.
 *
 * Everything here is optional and off by default: a personal-deck session
 * passes nothing and behaves exactly as before.
 */
export interface ExerciseTracking {
  /**
   * Fires once per submitted answer, including retries of the same word.
   * Invoked after the state update, never inside the updater, so it cannot be
   * double-counted by a re-invoked reducer.
   */
  onAnswer?: (wordId: number, result: AttemptResult) => void;
}
