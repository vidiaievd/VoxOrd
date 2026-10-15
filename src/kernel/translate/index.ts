// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/translate/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Ai,
  AiVisibility,
  AttemptsPolicy,
  Check,
  Coverage,
  Diff,
  DiffToken,
  Direction,
  Flow,
  Format,
  Gloss,
  Guard,
  GuardHit,
  Item,
  ItemDirection,
  Judgement,
  Langs,
  Routing,
  ShowRefsPolicy,
  Translate,
  TranslateTask,
  TranslateType,
  Verdict,
} from './model';
export {
  DEFAULT_AI,
  DEFAULT_CHECK,
  DEFAULT_FLOW,
  TRANSLATE_TYPES,
} from './model';

export {
  answerLang,
  authoredItems,
  coverage,
  diff,
  expandRef,
  hasAlts,
  itemDirection,
  judge,
  MAX_VARIANTS,
  norm,
  refs,
  route,
  runItems,
  sourceLang,
  tokens,
  typoEq,
  variants,
  wordEq,
} from './engine';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState } from './issues';
export { blockers, isReady, issues, stepState, warnings } from './issues';

export type {
  DocumentEnvelope,
  PersistedAnswerItem,
  PersistedAnswers,
  PersistedContent,
  PersistedItem,
  SubmittedItem,
} from './persistence';
export {
  DEFAULT_LANGS,
  dirForCode,
  fromPersisted,
  isTranslateCode,
  readAnswers,
  readContent,
  readSubmission,
  templateCode,
  toContent,
  toExpectedAnswers,
  toSubmission,
} from './persistence';

export type {
  ItemOutcome,
  ProjectedFlow,
  ProjectedItem,
  SelfCheckFeedback,
  SelfCheckItem,
  StudentProjection,
} from './projection';
export { gradeSubmission, MASK, maskMissing, selfCheckFeedback, toStudentProjection } from './projection';
