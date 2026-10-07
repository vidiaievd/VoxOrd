/**
 * `read_aloud` on the phone — plan 70, phase 10.
 *
 * The recorder's rules, the recording envelope and the shapes of the draft and the
 * submission are the kernel's, mirrored here because this repository is built on its own
 * (see the headers on each file). The machine that decides when a take starts, stops and
 * what an interruption costs is the same one the browser runs; only the microphone under
 * it differs (`services/recorder`).
 *
 * The rubric arithmetic (`rubric.ts`, over `lib/writingTask/verdict.ts`) is mirrored for the
 * graded card: the points a learner is shown are added up by the function the server used.
 * What is *not* mirrored is anything only an author or a server needs: no issue codes, no
 * persistence, no projection — the phone reads the projection it is
 * given (`screens/ExerciseRunner/templates/readAloud.ts`) and records against it.
 */

export type {
  Mode,
  Recording,
  RevisionPolicy,
  ShowModelPolicy,
  ShowRubricPolicy,
} from './model';
export { DEFAULT_RECORDING, isMode, RA_MAX_TAKES } from './model';

export { baseMime, formatSeconds, LIMITS, recordLimit } from './limits';

export type {
  Notice,
  Phase,
  RecorderConfig,
  RecorderEvent,
  RecorderPrompt,
  RecorderState,
  SubmitBlock,
  Take,
  UploadState,
} from './recorder';
export {
  canSubmit,
  chosenIndex,
  chosenTake,
  clockSeconds,
  clockWarns,
  COUNTDOWN_SECONDS,
  initialState,
  isShort,
  left,
  micOk,
  micSilent,
  nextTakeNumber,
  recordedCount,
  recordedShare,
  reduce,
  sentTakes,
  shortOnes,
  submitBlock,
  takesOf,
  ticking,
  uploadsPending,
} from './recorder';

export type {
  Draft,
  DraftTake,
  Submission,
  SubmittedRecording,
  SubmittedTake,
} from './submission';
export {
  readDraft,
  readSubmission,
  toDraft,
  toSubmission,
  unsentAssets,
} from './submission';

export type {
  PromptOutcome,
  SpeakingCriterion,
  SpeakingOutcome,
  SpeakingSnapshot,
} from './rubric';
export { readMarks, readSpeakingSnapshot, scorePrompts } from './rubric';
