// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/error-correction/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Ai,
  AiVisibility,
  AlignOp,
  Alignment,
  AttemptsPolicy,
  Check,
  Coverage,
  ErrorCorrection,
  ErrorCorrectionTask,
  Flow,
  Hints,
  Item,
  Judgement,
  Mode,
  Routing,
  ShowRefsPolicy,
  Span,
  SpanKey,
  SpanOutcome,
  SpanOverride,
  SpanState,
  SpanType,
  StrayEdit,
  StrayPolicy,
  StudentEdits,
  Verdict,
} from './model';
export {
  DEFAULT_AI,
  DEFAULT_CHECK,
  DEFAULT_FLOW,
  DEFAULT_HINTS,
  EMPTY_EDITS,
  FUNCTION_WORDS,
  SPAN_TYPES,
} from './model';

export {
  align,
  authoredItems,
  bare,
  build,
  coverage,
  edited,
  expandRef,
  hardSpans,
  hasRef,
  inferType,
  inserted,
  judge,
  norm,
  route,
  spanKey,
  spanState,
  spans,
  touched,
  typoEq,
  variants,
  wordEq,
  words,
} from './engine';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState } from './issues';
export { blockers, isReady, issues, stepState, transcriptGivesAway, warnings } from './issues';

export type {
  DocumentEnvelope,
  PersistedAnswerItem,
  PersistedAnswers,
  PersistedContent,
  PersistedItem,
} from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  readEdits,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedFlow,
  ProjectedItem,
  SelfCheckFeedback,
  SelfCheckItem,
  StudentProjection,
} from './projection';
export { selfCheckFeedback, toStudentProjection } from './projection';
