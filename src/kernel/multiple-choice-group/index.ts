// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/multiple-choice-group/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Column,
  Layout,
  MultipleChoiceGroupContent,
  Preset,
  RetryPolicy,
  Row,
  Settings,
  ShowWhy,
  Source,
  SourceMode,
} from './model';
export {
  DEFAULT_SETTINGS,
  emptyContent,
  maxAttempts,
  newColumn,
  newRow,
  passMark,
  PRESETS,
  shortFor,
} from './model';

export type { Balance, ColumnCount, Coverage } from './derive';
export {
  balance,
  column,
  coverage,
  isAnswered,
  quoteFound,
  readyRows,
  setAnswer,
  writtenRows,
} from './derive';

export { addColumn, applyPreset, matchesPreset, removeColumn } from './presets';

export { identityShuffle, shuffled } from './shuffle';

export type { LanguagePack } from './language';
export { countNegations, normalizeText, packFor, PACKS } from './language';

export type {
  Issue,
  IssueCode,
  IssueLevel,
  IssueOptions,
  IssueStep,
  StepState,
  StepStatus,
} from './issues';
export { audit, blockers, isReady, issues, stepState, warnings } from './issues';

export { appendRows, parseBulk } from './bulk';

export type { Answers, CheckInput, CheckResult, RowOutcome } from './grading';
export { allAnswered, carryOver, check, remaining } from './grading';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedRow,
} from './persistence';
export {
  fromPersisted,
  isMultipleChoiceGroupDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedColumn,
  ProjectedRow,
  ProjectedSettings,
  ProjectedSource,
  Shuffle,
  StudentProjection,
} from './projection';
export { projectSettings, toStudentProjection } from './projection';
