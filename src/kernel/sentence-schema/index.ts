// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/sentence-schema/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Chunk,
  ClauseId,
  Extra,
  Field,
  OrderMode,
  PrefillMode,
  Row,
  Schema,
  SentenceSchemaContent,
  Settings,
} from './model';
export {
  CLAUSE_IDS,
  DEFAULT_SETTINGS,
  deliverableRows,
  emptyContent,
  fieldsFor,
  isDeliverable,
  newChunk,
  newExtra,
  newField,
  newRow,
  ORDER_FIELD,
  ORDER_FIELD_ID,
} from './model';

export type { Preset } from './presets';
export { emptySchema, packsFor, preset, PRESETS } from './presets';

export { chunksToText, join, retokenize, split, tokenize } from './tokenize';

export type { FieldMark, GradeResult, ItemMark, Placement } from './grading';
export {
  DEFAULT_ORDER,
  expectedIn,
  grade,
  initialPlacement,
  keepCorrect,
  scoreRow,
  solution,
} from './grading';

export type { Feedback, FeedbackSource } from './feedback';
export { bannerFor, feedbackFor } from './feedback';

export type { Issue, IssueCode, IssueLevel, IssueStep, Passes, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, passes, stepState, warnings } from './issues';

export type { ParseOptions } from './bulk';
export { applyBulk, parseBulk } from './bulk';

export type {
  PersistedAnswers,
  PersistedChunk,
  PersistedContent,
  PersistedKey,
  PersistedRow,
} from './persistence';
export {
  fromPersisted,
  isSentenceSchemaDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type { ProjectedItem, ProjectedRow, Shuffle, StudentProjection, StudentResult } from './projection';
export { bankOf, keyIsDue, revealRow, toStudentProjection, toStudentResult } from './projection';
