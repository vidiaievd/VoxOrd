/**
 * The listening layer on the phone — plan 56 phase 7.
 *
 * The rules are the kernel's, mirrored here because this repository is built on its
 * own (see the headers on `model.ts` and `allowance.ts`). What is *not* mirrored is
 * anything only an author or a server needs: no issue codes, no draft writing, no
 * projection — a learner's device reads the block and plays it, and that is all.
 */

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
export { AUDIO_DEFAULT, audioOf, audioOn, formatDuration, hasClip, segmentOf } from './model';

export type {
  AllowanceContext,
  AllowanceEvent,
  AllowanceState,
  AllowanceStep,
  PlaybackEffect,
} from './allowance';
export { canPlay, hasHeard, INITIAL_STATE, isExhausted, isGated, limitOf, step } from './allowance';

export { deliveredSegments } from './projection';
