// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/multiple-choice/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  KindConfig,
  Layout,
  MultipleChoiceContent,
  Option,
  Question,
  QuestionKind,
  RetryPolicy,
  Settings,
} from './model';
export {
  DEFAULT_SETTINGS,
  duplicateQuestion,
  emptyContent,
  KINDS,
  kindConfig,
  maxAttempts,
  newOption,
  newQuestion,
} from './model';

export { answerableQuestions, correctOption, filledOptions, isAnswerable, setKey } from './derive';

export { identityShuffle, ordered, shuffled } from './shuffle';

export type { LanguagePack } from './language';
export { normalizeText, packFor, PACKS } from './language';

export type { Coverage, Issue, IssueCode, IssueLevel, IssueOptions, IssueStep, StepState, StepStatus } from './issues';
export { audit, blockers, coverage, isReady, issues, stepState, warnings } from './issues';

export type {
  AnswerInput,
  AnswerVerdict,
  AttemptResult,
  QuestionOutcome,
  SubmittedAnswer,
} from './grading';
export { eliminate, gradeAttempt, judge } from './grading';

export { parseBulk } from './bulk';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedOption,
  PersistedQuestion,
} from './persistence';
export {
  fromPersisted,
  isMultipleChoiceDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedOption,
  ProjectedQuestion,
  ProjectedSettings,
  Shuffle,
  StudentProjection,
} from './projection';
export { projectSettings, toStudentProjection } from './projection';
