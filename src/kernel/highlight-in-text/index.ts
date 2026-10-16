// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/highlight-in-text/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type { Token } from './tokenize';
export { tokenize, TOKENIZER_ID, wordsOf } from './tokenize';
export { TOKENIZER_FIXTURE } from './tokenizer-fixture';

export type {
  Attempts,
  HighlightInTextContent,
  Orphan,
  Penalty,
  Question,
  Settings,
  Span,
  Unit,
} from './model';
export {
  ATTEMPTS,
  DEFAULT_SETTINGS,
  emptyContent,
  HT_DENSITY_HIGH,
  HT_FEW_SPANS,
  HT_MAX_Q,
  HT_TEXT_LONG,
  HT_TEXT_SHORT,
  maxChecks,
  newId,
  newQuestion,
  passMark,
  PENALTIES,
  PENALTY_WEIGHT,
  UNITS,
} from './model';

export type { CharRange, SnapResult, TokenRun } from './coordinates';
export {
  clampToParagraph,
  isOnTokens,
  mergeRuns,
  paragraphOfTokens,
  snapMarks,
  toCharRange,
  toTokenRun,
} from './coordinates';

export type { CeilingCause, Coverage, SpanRun } from './derive';
export {
  ceilingCause,
  coverage,
  density,
  markedWords,
  normalize,
  overlaps,
  readyQuestions,
  runsOfWords,
  spanOrdinals,
  spanRuns,
  surface,
  tokensOf,
  wordCount,
} from './derive';

export type { ReanchorPreview } from './reanchor';
export { canPutBack, dropOrphan, previewReanchor, putBack, reanchor } from './reanchor';

export type { MarkEdit } from './edits';
export {
  addQuestion,
  applyText,
  canAddQuestion,
  clearMarks,
  removeQuestion,
  removeSpan,
  resizeMark,
  setSpanWhy,
  setUnit,
  toggleMark,
  update,
  updateQuestion,
  updateSettings,
} from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, stepState, warnings } from './issues';

export type {
  Cell,
  CellState,
  CheckInput,
  CheckOutcome,
  CheckRefusal,
  CheckResult,
  GradeResult,
  KeySpan,
  QuestionState,
} from './grading';
export { check, grade, readQuestionStates } from './grading';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedQuestion,
} from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  spanCounts,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type { ProjectedQuestion, ProjectedSettings, StudentProjection } from './projection';
export { toStudentProjection, withGradedSettings } from './projection';

export type { LanguagePack } from './presets';
export { instructionFor, packFor, PACKS } from './presets';
