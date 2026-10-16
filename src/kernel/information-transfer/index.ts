// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/information-transfer/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// `information_transfer` — fill in a form from a text or a recording (plan 73).

export type {
  Answering,
  Attempts,
  Field,
  FieldType,
  Form,
  Grading,
  HintsAfter,
  InfFocus,
  InformationTransferContent,
  Layout,
  Memory,
  RevealKey,
  Scoring,
  ShowSource,
  SourceKind,
} from './model';
export {
  ATTEMPTS,
  DEFAULT_ANSWERING,
  DEFAULT_FORM,
  DEFAULT_GRADING,
  DEFAULT_SCORING,
  emptyAudio,
  emptyContent,
  FIELD_TYPES,
  FOCUSES,
  FORMAT_TYPES,
  HINTS_AFTER,
  isFormatType,
  isLexicalType,
  LAYOUTS,
  MAX_FIELDS,
  maxChecks,
  MEMORIES,
  MIN_FIELDS,
  newField,
  newId,
  REVEAL_KEYS,
  SHOW_SOURCES,
  SOURCE_KINDS,
} from './model';

export type { AcceptedTemplates, FormatPack, PackPlaceholders } from './packs/index';
export { packFor, PACKS, packsFor } from './packs/index';

export {
  canon,
  dateCandidates,
  moneyCandidates,
  normText,
  numberCandidates,
  phoneCandidates,
  timeCandidates,
  wordsToNumber,
} from './formats';

export {
  expectedOf,
  formatFields,
  inSource,
  packOf,
  readyFields,
  skillOf,
  sourceText,
  wordsIn,
} from './derive';

export type { CellGrade, CellOutcome, CheckInput, CheckResult, Verdict } from './grading';
export { check, gradeCell, keyPasses, passes, VERDICTS } from './grading';

export { acceptedForms, numberToWords } from './accepted';

export type { ScanHit } from './scan';
export { isAlreadyAField, scanSource } from './scan';

export {
  addField,
  moveField,
  removeExpected,
  removeField,
  setAnswering,
  setAudio,
  setExpected,
  setField,
  setFieldAudio,
  setFocus,
  setForm,
  setGrading,
  setInstruction,
  setLanguage,
  setPassage,
  setPassageTitle,
  setScoring,
  setSourceKind,
  setTitle,
} from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export {
  AUDIO_STEPS,
  audioIssuesOf,
  blockers,
  isReady,
  issues,
  placedAudioIssues,
  stepState,
} from './issues';

export {
  cellAtomsForMemory,
  practicedAtomsForMemory,
  ratesWords,
  SKILL_ATOM_TYPE,
  skillAtomId,
  skillAtoms,
} from './memory';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedField,
  PersistedKey,
} from './persistence';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type { ProjectedField, StudentProjection } from './projection';
export { toStudentProjection, withGradedSettings } from './projection';

export {
  SAMPLE_ANSWERS,
  SAMPLE_FIELD_IDS,
  SAMPLE_PASSAGE,
  SAMPLE_TRANSCRIPT,
  sampleContent,
} from './fixture';
