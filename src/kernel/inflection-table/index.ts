// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/inflection-table/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

export type { Paradigm, ParadigmPack, Slot } from './packs';
export { instructionFor, packById, packFor, PACKS } from './packs';

export type {
  Cell,
  CellMode,
  InflectionTableContent,
  InputMode,
  InputSettings,
  RevealKey,
  Row,
  Settings,
} from './model';
export {
  cellKey,
  DEFAULT_INPUT,
  DEFAULT_SETTINGS,
  emptyContent,
  IT_BANK_CROWDED,
  IT_FEW_ROWS,
  IT_MANY_ROWS,
  IT_MAX_ATTEMPTS,
  IT_MAX_BANK_EXTRA,
  IT_MAX_ROWS,
  IT_MIN_ATTEMPTS,
  IT_MIN_SLOTS,
  IT_MIN_THRESHOLD,
  maxChecks,
  newCell,
  newId,
  packOf,
  paradigmOf,
  parseCellKey,
  REVEAL_KEYS,
  slotsGone,
  slotsInPlay,
} from './model';

export type { NearMiss } from './compare';
export { cellOk, keysOf, nearMiss, norm } from './compare';

export type { AskedCell, CeilingCause, FormsCoverage } from './derive';
export {
  askedCells,
  ceilingCause,
  cellOf,
  derivedTargets,
  firstLetter,
  formsCoverage,
  gradedCells,
  isLinked,
  readyRows,
} from './derive';

export type { DictionaryEntry } from './dictionary';
export { bare, entriesFor, fromDictionary, lemmaOf, suggestedForm } from './dictionary';

export { bankForms, distractors, distractorShortfall, inBank } from './bank';

export type { ParadigmSwitch } from './edits';
export {
  addAccept,
  addManualRow,
  addRow,
  bulkFirstGiven,
  bulkOpenAll,
  canAddRow,
  pickParadigm,
  previewParadigmSwitch,
  removeAccept,
  removeRow,
  setCellMode,
  setCellValue,
  setInstruction,
  setLemma,
  setTitle,
  setWhy,
  toggleSlot,
  updateInput,
  updateSettings,
} from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, stepState } from './issues';

export type { CellOutcome, CheckInput, CheckResult, RowOutcome } from './grading';
export { check } from './grading';

export type {
  PersistedAnswers,
  PersistedCell,
  PersistedContent,
  PersistedKey,
  PersistedRow,
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
  ProjectedCell,
  ProjectedRow,
  ProjectedSettings,
  ProjectedSlot,
  Shuffle,
  StudentProjection,
} from './projection';
export { toStudentProjection, withGradedSettings } from './projection';

export type { GradingCase } from './fixture';
export { ALL_RIGHT, GRADING_FIXTURE, sampleContent } from './fixture';
