// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/short-answer/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  KeyElement,
  KindConfig,
  PassRule,
  Question,
  QuestionKind,
  Routing,
  Settings,
  ShortAnswerContent,
  ShowModelPolicy,
  TeacherReviewPolicy,
} from './model';
export { DEFAULT_SETTINGS, emptyContent, kindConfig, KINDS, newElement, newQuestion } from './model';

export { hasAnchor, levenshtein, normalize, wordEquals, words } from './matching';

export type {
  AttemptOutcome,
  Coverage,
  ElementHit,
  GradedAnswer,
  QuestionResult,
  SubmittedAnswer,
  Verdict,
} from './grading';
export {
  coverage,
  grade,
  gradeAttempt,
  answerableQuestions,
  gradeableQuestions,
  modelPasses,
  usableElements,
} from './grading';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { audit, blockers, isReady, issues, stepState, warnings } from './issues';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedQuestion,
} from './persistence';
export {
  fromPersisted,
  isShortAnswerDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  GradedQuestion,
  ProjectedHit,
  ProjectedQuestion,
  ProjectedSettings,
  StudentProjection,
  StudentResult,
} from './projection';
export { toStudentProjection, toStudentResult } from './projection';
