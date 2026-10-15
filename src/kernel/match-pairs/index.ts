// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/match-pairs/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type {
  Coverage,
  Distractor,
  FeedbackOrigin,
  MatchPairs,
  MatchTask,
  Override,
  Pair,
  PairFeedback,
  PairId,
  PairResult,
  Placement,
  RightId,
  RightItem,
  Settings,
  Variant,
} from './model';
export { DEFAULT_SETTINGS } from './model';

export type { DocumentEnvelope, PersistedAnswers, PersistedContent } from './persistence';
export {
  fromPersisted,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedItem,
  ProjectedSlot,
  ProjectionOptions,
  StudentProjection,
} from './projection';
export { toStudentProjection } from './projection';

export type { Issue, IssueCode, IssueLevel, IssueStep } from './issues';
export { blockers, defaultExplanationLevel, isReady, issues, stepState, warnings } from './issues';

export {
  completePairs,
  coverage,
  EMPTY_FEEDBACK,
  explanationFor,
  feedbackFor,
  grade,
  isSolved,
  norm,
  pruneFeedback,
  rightItems,
  shuffled,
  wrongItems,
} from './selectors';
