// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/writing-task/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Ai,
  AiSelfLimit,
  AiVisibility,
  Criterion,
  CriterionMetric,
  Image,
  Letter,
  LetterRegister,
  Mode,
  ModeConfig,
  ModeNeeds,
  Point,
  RevisionPolicy,
  Settings,
  ShowModelPolicy,
  ShowRubricPolicy,
  WritingTask,
  WritingTaskContent,
} from './model';
export {
  DEFAULT_AI,
  DEFAULT_SETTINGS,
  defaultRubric,
  emptyContent,
  LEN_DEFAULTS,
  MODES,
  modeConfig,
  newPoint,
} from './model';

export type { Analysis, PointCoverage, TextLength } from './analysis';
export {
  analyse,
  hasPhrase,
  normalize,
  paragraphs,
  rubricMax,
  rubricScore,
  usablePoints,
  words,
} from './analysis';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, stepState, warnings } from './issues';

export type {
  RubricMarks,
  RubricOutcome,
  RubricSnapshot,
  SnapshotCriterion,
} from './verdict';
export {
  readRubricMarks,
  readRubricSnapshot,
  scoreRubric,
  snapshotRubric,
  toPercent,
} from './verdict';

export type {
  DocumentEnvelope,
  PersistedAnswers,
  PersistedContent,
  PersistedCriterion,
  PersistedPoint,
} from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedCriterion,
  ProjectedPoint,
  ProjectedSettings,
  StudentProjection,
} from './projection';
export { toStudentProjection } from './projection';
