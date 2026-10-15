// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/audio/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// Public surface of the audio layer — plan 56 phase 1.

export type {
  AudioLayout,
  AudioSettings,
  AudioSource,
  ExerciseAudio,
  GateMode,
  ItemAudio,
  LessonAudioRef,
  PlayLimit,
  TranscriptPolicy,
} from './model';
export {
  AUDIO_DEFAULT,
  audioOf,
  audioOn,
  formatDuration,
  formatTimecode,
  hasClip,
  parseDuration,
  parseTimecode,
  toTenths,
  segmentOf,
} from './model';

export type {
  AllowanceContext,
  AllowanceEvent,
  AllowanceState,
  AllowanceStep,
  PlaybackEffect,
} from './allowance';
export { canPlay, hasHeard, INITIAL_STATE, isExhausted, isGated, limitOf, step } from './allowance';

export type {
  AudioIssue,
  AudioIssueCode,
  AudioIssueLevel,
  AudioIssuePart,
  AudioItem,
  AudioStepMap,
  PlacedAudioIssue,
} from './issues';
export { audioIssues, hasAudioBlocker, placeAudioIssues } from './issues';

export type { StudentAudio } from './projection';
export { deliveredSegments, redactTranscript, segmentsOf, transcriptOnReveal, withStudentAudio } from './projection';

export type { IdentifiedItem } from './items';
export { hasItemClips, itemKey, itemsOf } from './items';

export type { AudioDraft } from './authoring';
export {
  applyAudioDraft,
  draftIssues,
  readAudioDraft,
  withAudio,
  withAudioSettings,
  withSegment,
} from './authoring';
