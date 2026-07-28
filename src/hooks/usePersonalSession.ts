import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createEvidence,
  gradeSession,
  recordWordAttempt,
  type SessionEvidence,
} from '../lib/sessionEvidence';
import {
  gradePersonalWord,
  type AttemptResult,
  type SessionMode,
} from '../lib/sessionGrader';
import { progressRepository } from '../repositories/ProgressRepository';
import type { ExerciseTracking } from './exerciseTracking';

/**
 * Accumulates one personal-deck session's answers and schedules its words with
 * the on-device FSRS engine when the session ends (plan Step 9.4).
 *
 * The local counterpart of `useCourseReviewSession`, and it exists for the same
 * reason: **one rating per word per session**. Deep Session drills the same
 * word set through several phases, so grading per answer — or per phase — would
 * reschedule one card several times over for what the user experiences as a
 * single sitting.
 *
 * That is why the session belongs to whoever owns the *whole* sitting, never to
 * an individual exercise: `DeepSessionScreen` owns one across its phases, while
 * a standalone exercise owns its own. `ownedTracking` below encodes that rule.
 *
 * Dual write, deliberately: nothing here touches the 6-stage columns, which
 * `progressRepository.recordAnswer` keeps writing per answer exactly as before.
 * Everything that *reads* a schedule still speaks 6-stage until Step 9.5, so
 * this step must be invisible on device — that is what makes it testable.
 */

export interface PersonalSession {
  /** Instrumentation to hand an exercise running `mode` in this session. */
  trackingFor: (mode: SessionMode) => ExerciseTracking;
  /**
   * Grades every word with evidence and writes its new FSRS card. Idempotent —
   * a session grades once, whether it ended by completion or by unmount.
   */
  finish: () => Promise<void>;
}

export function usePersonalSession(deckId: number): PersonalSession {
  // A ref, not state: `finish` runs from an unmount cleanup, where a state read
  // would see a stale closure and grade an empty ledger.
  const evidenceRef = useRef<SessionEvidence>(createEvidence());
  const finishedRef = useRef(false);

  // Guards against a stale grade landing on the next deck if the screen is
  // reused: a session belongs to the deck it started on.
  const deckIdRef = useRef(deckId);
  deckIdRef.current = deckId;

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const graded = gradeSession(evidenceRef.current, gradePersonalWord);
    if (graded.length === 0) return;

    // One timestamp for the whole session: the answers are evidence about one
    // sitting, so they must not schedule off slightly different instants.
    const reviewedAt = Date.now();
    for (const { wordId, rating } of graded) {
      // Silently skips course words and words with no progress row — see
      // `applyReview`. Sequential rather than parallel: these are small writes
      // on one SQLite connection, and ordering keeps a failure easy to read.
      await progressRepository.applyReview(wordId, deckIdRef.current, rating, reviewedAt);
    }
  }, []);

  const trackingFor = useCallback(
    (mode: SessionMode): ExerciseTracking => ({
      // Left false on purpose: the 6-stage write stays until Step 9.5 switches
      // the read paths over. This is the flag to flip there.
      skipLocalProgress: false,
      onAnswer: (wordId: number, result: AttemptResult) => {
        evidenceRef.current = recordWordAttempt(evidenceRef.current, wordId, mode, result);
      },
    }),
    [],
  );

  // Ends the session on the way out, so a user who backs out mid-way still gets
  // credit for the words already answered. `finish` being idempotent means a
  // session that already graded on completion does nothing here.
  useEffect(() => {
    return () => {
      finish();
    };
  }, [finish]);

  return useMemo(() => ({ trackingFor, finish }), [trackingFor, finish]);
}

/**
 * The tracking an exercise should use: its parent's when it is one phase of a
 * larger sitting, its own otherwise.
 *
 * The hook is always called — hooks cannot be conditional — but a session that
 * receives no answers grades nothing, so an unused one is inert.
 */
export function useOwnedTracking(
  deckId: number,
  mode: SessionMode,
  provided?: ExerciseTracking,
): ExerciseTracking {
  const session = usePersonalSession(deckId);
  const own = useMemo(() => session.trackingFor(mode), [session, mode]);
  return provided ?? own;
}
