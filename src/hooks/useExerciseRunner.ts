import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  answerQuestion as answerQuestionRequest,
  checkRow as checkRowRequest,
  getExerciseDisplay,
  startAttempt,
  submitAttempt,
  type AnswerQuestionAnswer,
  type AnswerQuestionResponse,
  type CheckRowResponse,
  type SubmitAttemptResponse,
} from '../api/exercises';
import { buildExerciseCompletionRequest, upsertProgress } from '../api/progress';
import type { ExerciseDisplay } from '../api/types';
import {
  getMemoryCache,
  readCacheSnapshot,
  setMemoryCache,
  writeCacheSnapshot,
} from '../lib/swrCache';
import {
  currentExerciseId,
  initRunnerState,
  isLastExercise,
  runnerReducer,
  type RunnerState,
} from '../screens/ExerciseRunner/runnerMachine';
import { buildMultipleChoiceGroupSubmission } from '../screens/ExerciseRunner/templates/multipleChoiceGroup';
import { useSettings } from './useSettings';

export type ProgressPostStatus = 'idle' | 'posting' | 'done' | 'error';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface ExerciseRunnerController {
  state: RunnerState;
  /** 1-based position and size of the set, for the progress bar. */
  progress: { current: number; total: number };
  isLast: boolean;
  /** Called by the body component when its answer / submittability changes. */
  setAnswer: (answer: unknown, canSubmit: boolean) => void;
  /**
   * Hand in one question of a set that is answered a question at a time
   * (`short_answer`, plan 51 §3.3; `multiple_choice`, plan 53 §3.3) and get its
   * verdict. Opens the attempt if it is not open yet, so the answers and the
   * Check that closes the set land on the same attempt.
   *
   * The answer is passed whole rather than as a string: the two templates hand
   * in different things — written text, or a picked option — and which one is
   * read is decided by the attempt's own template on the server, never named
   * here.
   */
  answerQuestion: (
    questionId: string,
    answer: AnswerQuestionAnswer,
  ) => Promise<AnswerQuestionResponse>;
  /**
   * Check one sentence of a `sentence_schema` set (plan 52 §3.3) and get its marks.
   * Repeatable, unlike `answerQuestion`; opens the attempt the same way, so the
   * sentences and the Check that closes the set land on the same attempt.
   */
  checkRow: (
    rowId: string,
    placement: Record<string, string[]>,
    reveal: boolean,
  ) => Promise<CheckRowResponse>;
  /**
   * Check the whole table of a `multiple_choice_group` and get the server's verdict
   * (plan 54 §8 Q6, variant D). Opens the attempt the same way its two siblings do.
   *
   * Repeatable, and that is the type: a check reports which statements are wrong, the
   * learner fixes them, and the next check goes onto the very same attempt — the engine
   * reopens a scored practice attempt and spends one of the author's `retry` budget on
   * it. `reveal` is «Vis fasit», closing the table with the score it already had.
   *
   * Unlike `checkRow`, this *is* the submit: there is no separate endpoint, and the
   * engine refuses a further check once the table is closed. So there is no footer Check
   * left to close the item with, and the body reports the closing verdict through
   * `finishTable` instead. Every other body ignores both.
   */
  checkTable: (
    answers: Record<string, string>,
    reveal: boolean,
  ) => Promise<SubmitAttemptResponse>;
  /**
   * Record the check that closed the table and move the runner to feedback.
   *
   * The other half of `checkTable`, and separate from it because closedness is a fact
   * about a template's own verdict: this hook does not read `details`, and the body that
   * understands them decides. The time is taken here, where the answering clock lives.
   */
  finishTable: (verdict: SubmitAttemptResponse) => void;
  /** Footer "Check": start + submit an attempt and grade server-side. */
  check: () => void;
  /** Footer "Continue": advance to the next item (or complete the set). */
  advance: () => void;
  /** Retry loading the current item after a load error. */
  retry: () => void;
  /** Footer "Try again": re-answer the same wrong item as a fresh attempt. */
  retryAttempt: () => void;
  /** Status of posting each result's progress once the set reaches 'complete'. */
  progressPostStatus: ProgressPostStatus;
}

/**
 * Orchestrates the exercise runner state machine with its side effects:
 * fetching display content per item, running the server-side attempt on
 * Check, and timing each item. Grading is entirely server-side — this hook
 * passes the body's opaque answer straight to the submit endpoint and never
 * inspects it.
 *
 * The attempt is created lazily on first use rather than when the exercise
 * opens, so opening an exercise and leaving without answering creates no
 * server-side attempt and cannot leave a dangling IN_PROGRESS attempt (which
 * would 409 a later start). First use is Check for every template that is
 * checked once, and the first question handed in for a `short_answer` set —
 * which is answered a question at a time onto the very same attempt that Check
 * then closes (plan 51 §3.3).
 */
export function useExerciseRunner(
  exerciseIds: string[],
  startIndex: number,
): ExerciseRunnerController {
  const { uiLanguage } = useSettings();
  const [state, dispatch] = useReducer(
    runnerReducer,
    undefined,
    () => initRunnerState(exerciseIds, startIndex),
  );

  const mounted = useRef(true);
  // When the current item's answering clock started, for timeSpentSeconds.
  const answeringStartedAtRef = useRef(Date.now());
  // Single-flight guard for the start+submit round-trip.
  const checkInFlightRef = useRef(false);
  // The attempt this item is being answered on, once there is one. Held here
  // rather than created inside `check`, because a set answered a question at a
  // time opens it earlier: the answers and the closing submit have to be the
  // same attempt, or the questions already handed in would be left on an
  // abandoned row (plan 51 §3.3). Cleared when a fresh item loads and on a retry.
  const attemptIdRef = useRef<string | null>(null);
  // Serialises the lazy open, so two quick taps cannot start two attempts.
  const openingRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load the current item's display whenever we enter the 'loading' phase.
  // Phase 6 open item: display content is near-immutable, so a cached copy
  // (memory, then the AsyncStorage snapshot) is an acceptable fallback for
  // offline reading — but unlike course home/lesson reader this does NOT
  // paint the cache first, since Check/submit still needs the network
  // regardless, so there's no benefit to showing cached content ahead of a
  // fast successful fetch.
  useEffect(() => {
    if (state.phase !== 'loading') return;
    const exerciseId = currentExerciseId(state);
    if (!exerciseId) return;
    // A fresh item is a fresh attempt; the previous one is closed or abandoned.
    attemptIdRef.current = null;
    openingRef.current = null;
    const cacheKey = `exercise-display:${exerciseId}:${uiLanguage}`;

    let cancelled = false;
    (async () => {
      try {
        const display = await getExerciseDisplay(exerciseId, uiLanguage);
        if (cancelled || !mounted.current) return;
        answeringStartedAtRef.current = Date.now();
        setMemoryCache(cacheKey, display);
        void writeCacheSnapshot(cacheKey, display);
        dispatch({ type: 'LOAD_SUCCESS', display });
      } catch (e) {
        if (cancelled || !mounted.current) return;
        const cached =
          getMemoryCache<ExerciseDisplay>(cacheKey) ?? (await readCacheSnapshot<ExerciseDisplay>(cacheKey));
        if (cancelled || !mounted.current) return;
        if (cached) {
          answeringStartedAtRef.current = Date.now();
          dispatch({ type: 'LOAD_SUCCESS', display: cached });
          return;
        }
        dispatch({ type: 'LOAD_FAILURE', message: errorMessage(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
    // idx identifies the item; phase gating prevents re-fetching after success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.idx, uiLanguage]);

  const setAnswer = useCallback((answer: unknown, canSubmit: boolean) => {
    dispatch({ type: 'ANSWER_CHANGE', answer, canSubmit });
  }, []);

  /**
   * The attempt for the item on screen, opened on first use.
   *
   * Still lazy, for the reason it always was: opening an exercise and leaving
   * without answering must create nothing, or the next start would 409 against
   * a dangling IN_PROGRESS attempt. What changed is who may trigger it — Check,
   * as before, and a body handing in its first question.
   */
  const openAttempt = useCallback(
    (exerciseId: string, display: ExerciseDisplay): Promise<string> => {
      const open = attemptIdRef.current;
      if (open !== null) return Promise.resolve(open);
      if (openingRef.current !== null) return openingRef.current;

      // PRACTICE so the feedback reveals the correct answer; grading is done
      // by the server regardless of mode.
      const pending = startAttempt(exerciseId, {
        language: display.targetLanguage,
        mode: 'PRACTICE',
      })
        .then(attempt => {
          attemptIdRef.current = attempt.attemptId;
          return attempt.attemptId;
        })
        .finally(() => {
          openingRef.current = null;
        });

      openingRef.current = pending;
      return pending;
    },
    [],
  );

  // Read off the state rather than through `currentExerciseId(state)`, so the
  // callback's dependencies are the two things it actually uses.
  const openExerciseId = state.exerciseIds[state.idx];
  const openDisplay = state.display;
  const answerQuestion = useCallback(
    async (
      questionId: string,
      answer: AnswerQuestionAnswer,
    ): Promise<AnswerQuestionResponse> => {
      if (!openExerciseId || !openDisplay) {
        throw new Error('No exercise is open');
      }
      const attemptId = await openAttempt(openExerciseId, openDisplay);
      return answerQuestionRequest(openExerciseId, attemptId, { questionId, ...answer });
    },
    [openExerciseId, openDisplay, openAttempt],
  );

  const checkRow = useCallback(
    async (
      rowId: string,
      placement: Record<string, string[]>,
      reveal: boolean,
    ): Promise<CheckRowResponse> => {
      if (!openExerciseId || !openDisplay) {
        throw new Error('No exercise is open');
      }
      const attemptId = await openAttempt(openExerciseId, openDisplay);
      return checkRowRequest(openExerciseId, attemptId, { rowId, placement, reveal });
    },
    [openExerciseId, openDisplay, openAttempt],
  );

  const checkTable = useCallback(
    async (answers: Record<string, string>, reveal: boolean): Promise<SubmitAttemptResponse> => {
      if (!openExerciseId || !openDisplay) {
        throw new Error('No exercise is open');
      }
      const attemptId = await openAttempt(openExerciseId, openDisplay);
      return submitAttempt(openExerciseId, attemptId, {
        submittedAnswer: buildMultipleChoiceGroupSubmission(answers, reveal),
        timeSpentSeconds: Math.max(
          0,
          Math.round((Date.now() - answeringStartedAtRef.current) / 1000),
        ),
        locale: uiLanguage,
      });
    },
    [openExerciseId, openDisplay, openAttempt, uiLanguage],
  );

  const finishTable = useCallback((verdict: SubmitAttemptResponse) => {
    dispatch({
      type: 'BODY_SUBMITTED',
      verdict,
      timeSpentSeconds: Math.max(
        0,
        Math.round((Date.now() - answeringStartedAtRef.current) / 1000),
      ),
    });
  }, []);

  const check = useCallback(async () => {
    if (state.phase !== 'answering' || !state.canSubmit) return;
    if (checkInFlightRef.current) return;
    const exerciseId = currentExerciseId(state);
    const display = state.display;
    if (!exerciseId || !display) return;

    checkInFlightRef.current = true;
    dispatch({ type: 'CHECK_START' });
    const timeSpentSeconds = Math.max(
      0,
      Math.round((Date.now() - answeringStartedAtRef.current) / 1000),
    );
    try {
      // Whatever the body already opened — a set answered a question at a time
      // has its answers on this attempt, and closing a different one would
      // leave them unread.
      const attemptId = await openAttempt(exerciseId, display);
      const verdict = await submitAttempt(exerciseId, attemptId, {
        submittedAnswer: state.answer,
        timeSpentSeconds,
        locale: uiLanguage,
      });
      if (!mounted.current) return;
      dispatch({ type: 'CHECK_SUCCESS', verdict, timeSpentSeconds });
    } catch (e) {
      if (!mounted.current) return;
      dispatch({ type: 'CHECK_FAILURE', message: errorMessage(e) });
    } finally {
      checkInFlightRef.current = false;
    }
  }, [state.phase, state.canSubmit, state.display, state.answer, state.idx, uiLanguage, openAttempt]);

  const advance = useCallback(() => {
    dispatch({ type: 'ADVANCE' });
  }, []);

  // Post one progress record per finished exercise once the set completes.
  // There's no backend "set" endpoint (EXERCISE is a singular content
  // type — see buildExerciseCompletionRequest), so this mirrors the web
  // reader's per-item POST /progress, just fired in a loop here. Fires once
  // per mount via progressPostedRef; best-effort — a failure here shouldn't
  // block the results screen the user is already looking at.
  const [progressPostStatus, setProgressPostStatus] = useState<ProgressPostStatus>('idle');
  const progressPostedRef = useRef(false);

  useEffect(() => {
    if (state.phase !== 'complete' || state.results.length === 0) return;
    if (progressPostedRef.current) return;
    progressPostedRef.current = true;

    setProgressPostStatus('posting');
    (async () => {
      try {
        await Promise.all(
          state.results.map(({ exerciseId, verdict, timeSpentSeconds }) =>
            upsertProgress(buildExerciseCompletionRequest(exerciseId, verdict, timeSpentSeconds)),
          ),
        );
        if (!mounted.current) return;
        setProgressPostStatus('done');
      } catch (e) {
        if (!mounted.current) return;
        console.warn('[ExerciseRunner] Failed to post set progress:', e);
        setProgressPostStatus('error');
      }
    })();
  }, [state.phase, state.results]);

  const retry = useCallback(() => {
    dispatch({ type: 'LOAD_START' });
  }, []);

  const retryAttempt = useCallback(() => {
    // Timer restarts here: the retry's timeSpentSeconds should measure the
    // second attempt, not include time spent reading the first verdict.
    answeringStartedAtRef.current = Date.now();
    // A retry is a new attempt: the one just submitted is closed, and reusing
    // its id would be submitting twice.
    attemptIdRef.current = null;
    openingRef.current = null;
    dispatch({ type: 'RETRY_ITEM' });
  }, []);

  const progress = useMemo(
    () => ({ current: state.idx + 1, total: state.exerciseIds.length }),
    [state.idx, state.exerciseIds.length],
  );

  return {
    state,
    progress,
    isLast: isLastExercise(state),
    setAnswer,
    answerQuestion,
    checkRow,
    checkTable,
    finishTable,
    check,
    advance,
    retry,
    retryAttempt,
    progressPostStatus,
  };
}
