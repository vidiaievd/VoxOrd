import type { ExerciseDisplay } from '../../api/types';
import type { SubmitAttemptResponse } from '../../api/exercises';

/**
 * Pure state machine driving the exercise runner. All side effects (fetching
 * display, starting/submitting attempts, timers) live in the hook that wraps
 * this reducer; everything here is deterministic and unit-tested.
 *
 * Phases:
 *   loading   → fetching the current exercise's display content
 *   answering → body shown, awaiting an answer + Check
 *   checking  → start+submit attempt round-trip in flight
 *   feedback  → server verdict shown, awaiting Continue
 *   loadError → display fetch failed (retriable, per item)
 *   complete  → the whole set is finished
 *
 * Answers are graded SERVER-SIDE (see src/api/exercises.ts). This machine
 * never inspects `answer` — it only carries it from the body to the submit
 * call. The mobile app holds no answer-checking logic for platform exercises.
 */
export type RunnerPhase =
  | 'loading'
  | 'answering'
  | 'checking'
  | 'feedback'
  | 'loadError'
  | 'complete';

/** One item's outcome, recorded on CHECK_SUCCESS and kept for the set's results summary. */
export interface ItemResult {
  exerciseId: string;
  verdict: SubmitAttemptResponse;
  timeSpentSeconds: number;
}

export interface RunnerState {
  /** The set of exercise (content) ids this runner walks through. */
  exerciseIds: string[];
  /** 0-based index of the current exercise within the set. */
  idx: number;
  phase: RunnerPhase;
  display: ExerciseDisplay | null;
  /** Opaque, template-specific answer produced by the body component. */
  answer: unknown;
  canSubmit: boolean;
  verdict: SubmitAttemptResponse | null;
  /** Non-fatal: submit failed; the machine stays in 'answering'. */
  submitError: string | null;
  /** Fatal for the current item: display fetch failed. */
  loadError: string | null;
  /** Every item's verdict so far, in order — survives the per-item reset, used to post progress and show the set's results summary once 'complete'. */
  results: ItemResult[];
}

export type RunnerAction =
  /** Begin (or retry) loading the current item's display. */
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; display: ExerciseDisplay }
  | { type: 'LOAD_FAILURE'; message: string }
  | { type: 'ANSWER_CHANGE'; answer: unknown; canSubmit: boolean }
  | { type: 'CHECK_START' }
  | { type: 'CHECK_SUCCESS'; verdict: SubmitAttemptResponse; timeSpentSeconds: number }
  | { type: 'CHECK_FAILURE'; message: string }
  | { type: 'ADVANCE' };

/** Fields reset every time we (re)enter a fresh item in the 'loading' phase. Excludes `results`, which accumulates across the whole set. */
function freshItemFields(): Omit<RunnerState, 'exerciseIds' | 'idx' | 'phase' | 'results'> {
  return {
    display: null,
    answer: null,
    canSubmit: false,
    verdict: null,
    submitError: null,
    loadError: null,
  };
}

export function initRunnerState(exerciseIds: string[], startIndex = 0): RunnerState {
  const clampedStart =
    exerciseIds.length === 0 ? 0 : Math.min(Math.max(0, startIndex), exerciseIds.length - 1);
  return {
    exerciseIds,
    idx: clampedStart,
    // An empty set is immediately complete; otherwise load the first item.
    phase: exerciseIds.length === 0 ? 'complete' : 'loading',
    results: [],
    ...freshItemFields(),
  };
}

export function currentExerciseId(state: RunnerState): string | undefined {
  return state.exerciseIds[state.idx];
}

export function isLastExercise(state: RunnerState): boolean {
  return state.idx >= state.exerciseIds.length - 1;
}

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'LOAD_START':
      // Valid as an entry (loading) or as a retry after a load error. Ignored
      // mid-flight so it can't clobber an answered/feedback item.
      if (state.phase !== 'loading' && state.phase !== 'loadError') return state;
      return { ...state, phase: 'loading', ...freshItemFields() };

    case 'LOAD_SUCCESS':
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'answering', display: action.display, loadError: null };

    case 'LOAD_FAILURE':
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'loadError', loadError: action.message };

    case 'ANSWER_CHANGE':
      // Answers only change while answering; editing clears a stale submit error.
      if (state.phase !== 'answering') return state;
      return {
        ...state,
        answer: action.answer,
        canSubmit: action.canSubmit,
        submitError: null,
      };

    case 'CHECK_START':
      // Guard the single-shot submit: only from a submittable 'answering' state.
      if (state.phase !== 'answering' || !state.canSubmit) return state;
      return { ...state, phase: 'checking', submitError: null };

    case 'CHECK_SUCCESS': {
      if (state.phase !== 'checking') return state;
      const exerciseId = currentExerciseId(state);
      const result: ItemResult[] = exerciseId
        ? [
            ...state.results,
            { exerciseId, verdict: action.verdict, timeSpentSeconds: action.timeSpentSeconds },
          ]
        : state.results;
      return { ...state, phase: 'feedback', verdict: action.verdict, results: result };
    }

    case 'CHECK_FAILURE':
      // Keep the answer so the user can just retry the Check.
      if (state.phase !== 'checking') return state;
      return { ...state, phase: 'answering', submitError: action.message };

    case 'ADVANCE': {
      // Only advance from feedback. Last item → complete; else load the next.
      if (state.phase !== 'feedback') return state;
      if (isLastExercise(state)) {
        return { ...state, phase: 'complete', ...freshItemFields() };
      }
      return { ...state, idx: state.idx + 1, phase: 'loading', ...freshItemFields() };
    }

    default:
      return state;
  }
}
