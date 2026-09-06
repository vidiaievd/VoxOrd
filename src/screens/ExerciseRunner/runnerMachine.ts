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
 *
 * One template hands the attempt in without passing through 'checking':
 * `multiple_choice_group` is checked and re-checked as a whole table on the
 * same attempt, so its body owns that cycle and reports only the check that
 * closed the table, through BODY_SUBMITTED (plan 54 §8 Q6). Everything after
 * that — the verdict, Continue, the results summary — is the ordinary path.
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
  /**
   * Bumped on RETRY_ITEM (reset to 0 on every fresh item). Only used as part
   * of the body component's remount key — `display.id` alone doesn't change
   * on a same-item retry, so a body's local input state (e.g. MatchPairsBody's
   * `links`) wouldn't otherwise reset.
   */
  attemptSeq: number;
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
  /**
   * A body handed the attempt in by itself and it came back closed.
   *
   * `multiple_choice_group` only, and it exists because for that template the round-by-
   * round check and the closing submit are the same call: the table is checked, and if
   * the engine leaves it open the body offers a retry and checks again — all of it while
   * this machine is still in 'answering'. There is no footer Check left to close the
   * item with, so the check that closes the table reports itself here instead (plan 54
   * §8 Q6, variant D).
   *
   * Deliberately not folded into CHECK_SUCCESS: that path is guarded on 'checking', the
   * phase the footer's Check puts us in, and relaxing it would let a lost round-trip
   * record a result for a template that never entered it.
   */
  | { type: 'BODY_SUBMITTED'; verdict: SubmitAttemptResponse; timeSpentSeconds: number }
  | { type: 'ADVANCE' }
  | { type: 'RETRY_ITEM' };

/** Fields reset every time we (re)enter a fresh item in the 'loading' phase. Excludes `results`, which accumulates across the whole set. */
function freshItemFields(): Omit<RunnerState, 'exerciseIds' | 'idx' | 'phase' | 'results'> {
  return {
    display: null,
    answer: null,
    canSubmit: false,
    verdict: null,
    submitError: null,
    loadError: null,
    attemptSeq: 0,
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

    case 'BODY_SUBMITTED': {
      // From 'answering' alone: a body that runs its own checks never leaves it, and a
      // second report for the same item would record the result twice.
      if (state.phase !== 'answering') return state;
      const exerciseId = currentExerciseId(state);
      const results: ItemResult[] = exerciseId
        ? [
            ...state.results,
            { exerciseId, verdict: action.verdict, timeSpentSeconds: action.timeSpentSeconds },
          ]
        : state.results;
      return { ...state, phase: 'feedback', verdict: action.verdict, results, submitError: null };
    }

    case 'ADVANCE': {
      // Only advance from feedback. Last item → complete; else load the next.
      if (state.phase !== 'feedback') return state;
      if (isLastExercise(state)) {
        return { ...state, phase: 'complete', ...freshItemFields() };
      }
      return { ...state, idx: state.idx + 1, phase: 'loading', ...freshItemFields() };
    }

    case 'RETRY_ITEM': {
      // Only from a genuinely wrong, graded verdict — not correct, and not a
      // requiresReview item (translate_*/writing_task have no right/wrong to retry).
      if (state.phase !== 'feedback' || !state.verdict) return state;
      if (state.verdict.correct || state.verdict.requiresReview) return state;
      // Drop this item's just-recorded wrong result — the retry's outcome
      // replaces it (only the latest attempt counts toward progress).
      const exerciseId = currentExerciseId(state);
      const results = exerciseId
        ? state.results.filter((r) => r.exerciseId !== exerciseId)
        : state.results;
      return {
        ...state,
        phase: 'answering',
        answer: null,
        canSubmit: false,
        verdict: null,
        submitError: null,
        results,
        attemptSeq: state.attemptSeq + 1,
      };
    }

    default:
      return state;
  }
}
