import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewRating } from '../api/srs';
import type { DeckReviewSet } from '../lib/courseReviewLoader';
import {
  cardIdForWord,
  isGraded,
  newCardWordIds,
  planPhases,
  type CourseReviewPhase,
} from '../lib/courseReviewSet';
import {
  createEvidence,
  gradeSession,
  recordWordAttempt,
  type SessionEvidence,
} from '../lib/sessionEvidence';
import type { AttemptResult } from '../lib/sessionGrader';
import { deepSessionRepository } from '../repositories/DeepSessionRepository';
import type { DeepSessionWord } from './useDeepSession';
import { reviewQueueStore } from '../store/reviewQueueStore';
import type { ExerciseTracking } from './exerciseTracking';

/**
 * Drives a multi-mode review session over words the server says are due.
 *
 * It is the course-word counterpart of `useDeepSession`, which is hardwired to
 * `loadWordsForDeck(deckId)` and cannot run an arbitrary subset. Three things
 * differ, and they are the point of the whole redesign:
 *
 * 1. **The word set comes from the server's FSRS queue**, not from a deck-wide
 *    random sample, and the local 4h deep-session cooldown deliberately does
 *    not apply — for course words FSRS due-ness decides when a word comes back.
 * 2. **Evidence accumulates across every phase and grades once at the end.**
 *    The same word is drilled in several modes; posting a review per mode would
 *    reschedule one card several times over, and the server's idempotency key
 *    does not help because those are legitimately distinct events.
 * 3. **The local 6-stage engine is suppressed** for these words (via
 *    `skipLocalProgress`), so a course word has exactly one schedule — the
 *    server's.
 *
 * Reviews go out through `reviewQueueStore`, which persists before sending, so
 * a session that goes offline mid-way still lands once the network returns.
 */

export type CourseSessionStage = 'loading' | 'running' | 'submitting' | 'complete';

export interface CourseReviewSessionState {
  stage: CourseSessionStage;
  phase: CourseReviewPhase | null;
  phaseIndex: number;
  totalPhases: number;
  /** Words for the non-scoring flashcard preview; empty unless NEW cards exist. */
  previewWords: DeepSessionWord[];
  /** Ratings actually posted, available once the session completes. */
  submitted: Array<{ wordId: number; rating: ReviewRating }>;
  /** Due words that produced no answer at all — left due on purpose. */
  ungradedCount: number;
}

export interface UseCourseReviewSessionResult {
  state: CourseReviewSessionState;
  /** Pass to the exercise components so answers reach the grader. */
  tracking: ExerciseTracking;
  /** Word ids to drill in the current phase, for `overrideWordIds`. */
  wordIds: number[];
  /** Called by each phase when it finishes. */
  advance: () => void;
  /** Abandon early: grades and submits whatever evidence exists so far. */
  finishEarly: () => void;
}

export function useCourseReviewSession(
  set: DeckReviewSet,
): UseCourseReviewSessionResult {
  const [previewWords, setPreviewWords] = useState<DeepSessionWord[]>([]);
  const [phases, setPhases] = useState<CourseReviewPhase[] | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [stage, setStage] = useState<CourseSessionStage>('loading');
  const [submitted, setSubmitted] = useState<
    Array<{ wordId: number; rating: ReviewRating }>
  >([]);

  // Evidence lives in a ref as well as state: `advance` and `finishEarly` read
  // it synchronously, and a state read there would see a stale closure.
  const evidenceRef = useRef<SessionEvidence>(createEvidence());
  const submittingRef = useRef(false);

  const previewIds = useMemo(() => newCardWordIds(set), [set]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Preview text comes from the local rows rather than the server card, so
      // the flashcard shows exactly what the deck shows everywhere else.
      const words =
        previewIds.length > 0
          ? await deepSessionRepository.loadWordsByIds(previewIds)
          : [];
      if (cancelled) return;

      setPreviewWords(words);
      setPhases(planPhases(set, words.map((word) => word.wordId)));
      setPhaseIndex(0);
      setStage('running');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.deckId, JSON.stringify(set.wordIds)]);

  const submitAll = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStage('submitting');

    const graded = gradeSession(evidenceRef.current);
    const posted: Array<{ wordId: number; rating: ReviewRating }> = [];

    for (const { wordId, rating } of graded) {
      const cardId = cardIdForWord(set, wordId);
      // Null means a padding word slipped through; it owns no card, so there is
      // nothing to review.
      if (!cardId) continue;
      // The queue persists the review before sending and replays it later if
      // the network is down, so a failure here is not lost work.
      await reviewQueueStore.submit(cardId, rating);
      posted.push({ wordId, rating });
    }

    setSubmitted(posted);
    setStage('complete');
  }, [set]);

  const advance = useCallback(() => {
    if (!phases) return;
    const next = phaseIndex + 1;
    if (next < phases.length) {
      setPhaseIndex(next);
      return;
    }
    submitAll();
  }, [phases, phaseIndex, submitAll]);

  const finishEarly = useCallback(() => {
    submitAll();
  }, [submitAll]);

  const tracking = useMemo<ExerciseTracking>(
    () => ({
      // Course words are server-authoritative; the local 6-stage engine must
      // not build a second schedule for them.
      skipLocalProgress: true,
      onAnswer: (wordId: number, result: AttemptResult) => {
        const phase = phases?.[phaseIndex];
        // The preview awards nothing, and padding words exist only to make the
        // 4-option modes buildable.
        if (!phase || phase === 'preview') return;
        if (!isGraded(set, wordId)) return;

        evidenceRef.current = recordWordAttempt(
          evidenceRef.current,
          wordId,
          phase,
          result,
        );
      },
    }),
    [set, phases, phaseIndex],
  );

  const phase = phases?.[phaseIndex] ?? null;
  const wordIds = phase === 'preview' ? previewIds : set.wordIds;
  const ungradedCount =
    stage === 'complete' ? set.due.length - submitted.length : 0;

  return {
    state: {
      stage,
      phase,
      phaseIndex,
      totalPhases: phases?.length ?? 0,
      previewWords,
      submitted,
      ungradedCount,
    },
    tracking,
    wordIds,
    advance,
    finishEarly,
  };
}
