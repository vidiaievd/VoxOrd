// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/dictation/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type { DcToken } from './tokens';
export { tokens, wordCount } from './tokens';

export type {
  Attempts,
  DictationContent,
  FocusOrphan,
  FocusWord,
  Marking,
  Mode,
  Near,
  Segment,
  Settings,
} from './model';
export {
  ATTEMPTS,
  DC_CHECK_INTERVAL_MS,
  DC_CLIP_LONG,
  DC_MAX_SEG,
  DC_ONE_PLAY_CROWDED,
  DC_SEG_LONG,
  DC_SEG_SHORT,
  DEFAULT_AUDIO,
  DEFAULT_MARKING,
  DEFAULT_SETTINGS,
  emptyContent,
  maxChecks,
  MODES,
  NEARS,
  newId,
  newSegment,
  passMark,
} from './model';

export type { DemoRewrite, LanguagePack } from './presets';
export { EMPTY_PACK, instructionFor, packFor, packOf, PACKS } from './presets';

export type { ErrorClass } from './classify';
export { acceptSpellings, classify, compareKey, ERROR_CLASSES, NEARABLE } from './classify';

export type { DelOp, DiffOp, DiffResult, EqOp, InsOp, SubOp, WordCounts } from './diff';
export { diff, passes } from './diff';

export type { CeilingCause } from './derive';
export {
  allWords,
  ceilingCause,
  focusAt,
  focusCoverage,
  isTimed,
  readySegments,
  timedCount,
} from './derive';

export type { SplitResult } from './split';
export { sentencesOf, splitTranscript } from './split';

export type { ReanchorResult } from './reanchor';
export { previewReanchor, putBackIndex, reanchorFocus } from './reanchor';

export type { JoinPreview } from './edits';
export {
  addSegment,
  applySplit,
  canAddSegment,
  canPutBack,
  dropOrphan,
  previewJoin,
  putBack,
  removeSegment,
  setFocusWhy,
  setMode,
  setSegmentAudio,
  setSegmentText,
  setSegmentWhy,
  toggleFocus,
  update,
  updateMarking,
  updateSettings,
} from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export {
  audioIssuesOf,
  audioItems,
  blockers,
  isReady,
  issues,
  keepsAudioIssue,
  SILENCED_AUDIO_CODES,
  stepState,
  warnings,
} from './issues';

export type {
  CheckInput,
  CheckOutcome,
  CheckRefusal,
  CheckResult,
  FirstCheck,
  FocusMiss,
  KeyFocus,
  LastCheck,
  RevealedKey,
  SegmentState,
  VerdictOp,
} from './grading';
export { check, focusMisses, gradeSegment, readSegmentStates } from './grading';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedSegment,
} from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type { ProjectedSegment, ProjectedSettings, StudentProjection } from './projection';
export { toStudentProjection, withGradedSettings } from './projection';

export { demoAnswer } from './demo';

export type { DiffCase } from './fixture';
export { DIFF_FIXTURE, opSignature } from './fixture';
