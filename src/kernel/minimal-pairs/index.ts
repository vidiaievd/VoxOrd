// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/minimal-pairs/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// `minimal_pairs` — listening discrimination: one word of a pair is played, the student picks
// what they heard (plan 72).

export type {
  Clip,
  Feedback,
  GlossPolicy,
  MemoryPolicy,
  MinimalPairsContent,
  OptionsMode,
  Pair,
  PlaysPerProbe,
  ProbeSet,
  Provenance,
  Sampling,
  Scoring,
  Sittings,
  SpellingPolicy,
  Word,
} from './model';
export {
  CLIP_LIMITS,
  DEFAULT_FEEDBACK,
  DEFAULT_SCORING,
  DEFAULT_SET,
  emptyClip,
  emptyContent,
  FEW_PAIRS,
  formatMs,
  GLOSS_POLICIES,
  hasClip,
  MAX_GOOD_OPTIONS,
  MAX_PROBES,
  MAX_WORDS,
  MEMORY_POLICIES,
  MIN_PROBES,
  MIN_WORDS,
  newId,
  newPair,
  newWord,
  OPTIONS_MODES,
  PASS_PCT_HIGH,
  PLAYS_PER_PROBE,
  probeNumber,
  probeQuestionId,
  PROBES_INPUT_MAX,
  PROBES_INPUT_MIN,
  PROBES_METER_MAX,
  PROVENANCES,
  SAMPLINGS,
  SITTINGS,
  SPELLING_POLICIES,
} from './model';

export type { ContrastFamily, ContrastIcon, Dialect, LanguagePack, PackPlaceholders, TtsPolicy } from './packs/index';
export {
  contrastsOf,
  exerciseContrast,
  libraryOf,
  packFor,
  pairContrast,
  pairContrastId,
} from './packs/index';

export type { PlacedWord } from './derive';
export {
  allWords,
  contrastsInSet,
  estimatedMinutes,
  filledWords,
  findWord,
  isReadyPair,
  missingClips,
  neededToPass,
  optionWords,
  pairSpread,
  probePool,
  readyPairs,
  syntheticByContrast,
  syntheticCount,
  voicesOf,
  wordCount,
} from './derive';

export type { DealtProbe, DrawnProbe, History, Rand, WordHistory } from './sampler';
export { deal, historyKey, lcg, readDraw, sample } from './sampler';

export type { PairResult, PickRefusal, PickVerdict, ProbeRecord, ProbeState, Summary } from './judge';
export {
  firstCorrect,
  historyFrom,
  judgePick,
  maxTries,
  probeRecords,
  readProbeRecords,
  summarize,
} from './judge';

export { atomsForMemory, CONTRAST_ATOM_TYPE, contrastAtomId, contrastAtoms, ratesWords } from './memory';

export type { ProbeOption, ProbeReveal, ProbeView, RevealedOption } from './probe';
export { revealOf, toProbeView } from './probe';

export * from './edits';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues';
export { blockers, isReady, issues, stepState } from './issues';

export type { PersistedAnswers, PersistedContent, PersistedPair } from './persistence';
export {
  fromPersisted,
  isMinimalPairsDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence';

export type { StudentProjection } from './projection';
export { toStudentProjection, withGradedSettings } from './projection';

export { SAMPLE_PAIR_IDS, sampleDocument } from './fixture';
