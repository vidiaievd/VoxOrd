// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/sort-into-buckets/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type { Attempts, Bucket, ItemFeedback, Settings, SortIntoBucketsContent, SortItem } from './model';
export {
  ATTEMPTS,
  DEFAULT_SETTINGS,
  emptyContent,
  maxChecks,
  newBucket,
  newId,
  newItem,
  passMark,
  SB_LONG_ITEM_WORDS,
  SB_MAX_BUCKETS,
  SB_MIN_BUCKETS,
  SB_MIN_PER_BUCKET,
  SB_MIN_READY_ITEMS,
  SB_MULTI_HEAVY_SHARE,
  SB_NONE,
  SB_SKEW_MIN_ITEMS,
  SB_SKEW_SHARE,
} from './model';

export type { BucketBalance, CeilingCause, Cell, Coverage, ShownBucket } from './derive';
export {
  accepted,
  accepts,
  balance,
  bucket,
  buckets,
  ceilingCause,
  cells,
  coverage,
  feedbackFor,
  firstClause,
  isSkewed,
  itemsIn,
  normalize,
  readyItems,
  writtenItems,
} from './derive';

export {
  addBucket,
  addItem,
  appendItems,
  assignBucket,
  canAddBucket,
  canRemoveBucket,
  canUseNone,
  moveBucket,
  moveItem,
  removeBucket,
  removeItem,
  replaceBuckets,
  setDefaultFeedback,
  setNoneLabel,
  setOverride,
  setUseNone,
  toggleAlso,
  updateBucket,
  updateItem,
  updateSettings,
} from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, stepState, warnings } from './issues';

export type { BulkResult } from './bulk';
export { parseBulk } from './bulk';

export type { BucketPreset, LanguagePack } from './presets';
export { noneLabelFor, packFor, PACKS, presetsFor } from './presets';

export { identityShuffle, shuffled } from './shuffle';

export type { BucketRule, CheckInput, CheckResult, ItemOutcome, Placement } from './grading';
export { check } from './grading';

export type { PersistedAnswers, PersistedContent, PersistedItem, PersistedKey } from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type {
  ProjectedBucket,
  ProjectedItem,
  ProjectedSettings,
  Shuffle,
  StudentProjection,
} from './projection';
export { toStudentProjection } from './projection';
