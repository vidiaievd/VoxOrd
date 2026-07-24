import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  getExerciseDisplay,
  startAttempt,
  submitAttempt,
} from '../api/exercises';
import {
  currentExerciseId,
  initRunnerState,
  isLastExercise,
  runnerReducer,
  type RunnerState,
} from '../screens/ExerciseRunner/runnerMachine';
import { useSettings } from './useSettings';

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
  /** Footer "Check": start + submit an attempt and grade server-side. */
  check: () => void;
  /** Footer "Continue": advance to the next item (or complete the set). */
  advance: () => void;
  /** Retry loading the current item after a load error. */
  retry: () => void;
}

/**
 * Orchestrates the exercise runner state machine with its side effects:
 * fetching display content per item, running the server-side attempt on
 * Check, and timing each item. Grading is entirely server-side — this hook
 * passes the body's opaque answer straight to the submit endpoint and never
 * inspects it.
 *
 * The attempt is created lazily on Check (not on open), so opening an
 * exercise and leaving without answering creates no server-side attempt and
 * cannot leave a dangling IN_PROGRESS attempt (which would 409 a later start).
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load the current item's display whenever we enter the 'loading' phase.
  useEffect(() => {
    if (state.phase !== 'loading') return;
    const exerciseId = currentExerciseId(state);
    if (!exerciseId) return;

    let cancelled = false;
    (async () => {
      try {
        const display = await getExerciseDisplay(exerciseId, uiLanguage);
        if (cancelled || !mounted.current) return;
        answeringStartedAtRef.current = Date.now();
        dispatch({ type: 'LOAD_SUCCESS', display });
      } catch (e) {
        if (cancelled || !mounted.current) return;
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
      // PRACTICE so the feedback reveals the correct answer; grading is done
      // by the server regardless of mode.
      const attempt = await startAttempt(exerciseId, {
        language: display.targetLanguage,
        mode: 'PRACTICE',
      });
      const verdict = await submitAttempt(exerciseId, attempt.attemptId, {
        submittedAnswer: state.answer,
        timeSpentSeconds,
        locale: uiLanguage,
      });
      if (!mounted.current) return;
      dispatch({ type: 'CHECK_SUCCESS', verdict });
    } catch (e) {
      if (!mounted.current) return;
      dispatch({ type: 'CHECK_FAILURE', message: errorMessage(e) });
    } finally {
      checkInFlightRef.current = false;
    }
  }, [state.phase, state.canSubmit, state.display, state.answer, state.idx, uiLanguage]);

  const advance = useCallback(() => {
    dispatch({ type: 'ADVANCE' });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'LOAD_START' });
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
    check,
    advance,
    retry,
  };
}
