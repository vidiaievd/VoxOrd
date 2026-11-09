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
  phaseBreakdown,
  recordWordAttempt,
  type PhaseScore,
  type SessionEvidence,
} from '../lib/sessionEvidence';
import type { AttemptResult } from '../lib/sessionGrader';
import { deepSessionRepository } from '../repositories/DeepSessionRepository';
import type { DeepSessionWord } from './useDeepSession';
import { reviewQueueStore } from '../store/reviewQueueStore';
import { vocabularyReplica } from '../services/vocabularyReplica';
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
  /** The planned phases in order — what the tracker draws. Empty while loading. */
  phases: CourseReviewPhase[];
  /** At least one graded answer is in — leaving now would cost something. */
  hasAnswers: boolean;
  /** Words for the non-scoring flashcard preview; empty unless NEW cards exist. */
  previewWords: DeepSessionWord[];
  /** Ratings actually posted, available once the session completes. */
  submitted: Array<{ wordId: number; rating: ReviewRating }>;
  /** Due words that produced no answer at all — left due on purpose. */
  ungradedCount: number;
  /** Per drilled phase, first-try correctness; set once the session completes. */
  byPhase: PhaseScore[];
  /** From the first phase to submission; 0 until the session completes. */
  elapsedMs: number;
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

export interface CourseReviewSessionOptions {
  /**
   * The learner was told the day's quota was met and chose to keep going. Sent
   * with every rating this session posts, since the cap is checked per review.
   */
  carryOnPastLimit?: boolean;
}

export function useCourseReviewSession(
  set: DeckReviewSet,
  options: CourseReviewSessionOptions = {},
): UseCourseReviewSessionResult {
  const [previewWords, setPreviewWords] = useState<DeepSessionWord[]>([]);
  const [phases, setPhases] = useState<CourseReviewPhase[] | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [stage, setStage] = useState<CourseSessionStage>('loading');
  const [submitted, setSubmitted] = useState<
    Array<{ wordId: number; rating: ReviewRating }>
  >([]);
  const [hasAnswers, setHasAnswers] = useState(false);
  const [byPhase, setByPhase] = useState<PhaseScore[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(0);

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
      startedAtRef.current = Date.now();
      setStage('running');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.deckId, JSON.stringify(set.wordIds)]);

  // Read through a ref so `submitAll` does not have to be rebuilt — and so a
  // session that started as a carry-on keeps that permission to its last rating.
  const carryOnRef = useRef(options.carryOnPastLimit ?? false);
  carryOnRef.current = options.carryOnPastLimit ?? false;

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
      const reviewedAt = new Date();
      // The phone's copy takes the rating first, so a word reviewed offline is
      // not due again on the next session (offline plan, B1).
      await vocabularyReplica.recordReview(cardId, rating, reviewedAt);
      // The queue persists the review before sending and replays it later if
      // the network is down, so a failure here is not lost work.
      const card = await reviewQueueStore.submit(cardId, rating, reviewedAt, {
        carryOnPastLimit: carryOnRef.current,
      });
      if (card) await vocabularyReplica.recordServerCard(card);
      posted.push({ wordId, rating });
    }

    // Read-only views of the same ledger, for the summary — they decide nothing.
    setByPhase(
      phaseBreakdown(
        evidenceRef.current,
        (phases ?? []).filter((p): p is Exclude<CourseReviewPhase, 'preview'> => p !== 'preview'),
      ),
    );
    setElapsedMs(Date.now() - startedAtRef.current);
    setSubmitted(posted);
    setStage('complete');
  }, [set, phases]);

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
      // No `skipLocalProgress` any more: since Step 9.5 an exercise writes no
      // schedule of its own, so there is nothing left to suppress. Course words
      // stay server-authoritative because only `usePersonalSession` schedules
      // locally, and it is never used here.
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
        setHasAnswers(true);
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
      phases: phases ?? [],
      hasAnswers,
      previewWords,
      submitted,
      ungradedCount,
      byPhase,
      elapsedMs,
    },
    tracking,
    wordIds,
    advance,
    finishEarly,
  };
}
