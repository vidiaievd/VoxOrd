/**
 * The microphone, as the `read_aloud` runner sees it — plan 70, phase 10.
 *
 * The same split the web runner keeps (`features/student/exercises/recorder/port.ts`): the
 * recorder's rules live in the kernel's machine (`lib/readAloud/recorder.ts`), and this is the
 * other half — the hardware and the bytes — behind a port, so the body can be tested without a
 * phone. The Android implementation is `nativeRecorder.ts` over the `AudioRecorder` module
 * (decision Q3-A); tests use `mockRecorder.ts`.
 *
 * Two differences from the browser's port, both because Android records into a file:
 *
 *   - a take comes back as a **file path**, not a blob — it is played from there with
 *     `react-native-sound` and uploaded from there;
 *   - the level check's meter is switched on and off explicitly (`meter`). A browser stream
 *     can be listened to without recording; Android cannot, so the check runs a recorder into
 *     a throwaway file, and it should run only while the check is on screen.
 */

/** Why the microphone could not be opened. Each is a state of its own (README, Q7-A). */
export type MicFailure = 'denied' | 'noDevice';

export type OpenResult = 'ok' | MicFailure;

/**
 * Why the hardware stopped being usable underneath the runner.
 *
 *   ended          the phone took the microphone — a call, another app
 *   deviceChanged  the input the take was recorded on is gone (a headset unplugged)
 *   hidden         the app went to the background
 */
export type InterruptReason = 'ended' | 'deviceChanged' | 'hidden';

/** One finished take, as the hardware handed it over. */
export interface Capture {
  /** Absolute path of the take in the app's cache. */
  path: string;
  /** What the recorder produced — `audio/mp4` (AAC) on Android. */
  mimeType: string;
  /** Measured by the native clock, not by the runner's whole-second ticks. */
  seconds: number;
  /** Bytes on disk. */
  size: number;
  /** Loudness through the take, 0..1, every `ENVELOPE_MS` — the waveform until the server's peaks. */
  envelope: number[];
}

/** How often the native side samples the envelope while a take is recording. */
export const ENVELOPE_MS = 100;

/** Bars in the level meter (`ra-meter`). */
export const METER_BANDS = 18;

export interface RecorderPort {
  /**
   * Ask for the microphone: the permission, and whether there is one. Idempotent once it has
   * answered `ok`.
   */
  open(): Promise<OpenResult>;
  /** Whether `open` has answered `ok`. */
  isOpen(): boolean;
  /** Run or stop the level check's meter. Nothing it hears is kept. */
  meter(on: boolean): void;
  /** The loudness right now, 0..1. Zero when nothing is listening. */
  level(): number;
  /** The last `METER_BANDS` levels, oldest first — the meter's bars. */
  levels(): number[];
  /** Start a take. Resolves `noDevice` when the microphone could not be had after all. */
  start(): Promise<OpenResult>;
  /** Finish the take. `null` when no take was running or it was cancelled meanwhile. */
  stop(): Promise<Capture | null>;
  /** Throw the running take away — an interruption is not the student's attempt. */
  cancel(): void;
  /** Release the microphone and delete every take file of this session. */
  close(): void;
  /** Subscribe to interruptions; returns the unsubscribe. */
  onInterrupt(listener: (reason: InterruptReason) => void): () => void;
}

/** The meter at rest. */
export function flatLevels(): number[] {
  return new Array<number>(METER_BANDS).fill(0);
}

/**
 * `count` values out of an envelope of any length: the loudest sample in each slice, so a short
 * loud word is not averaged away. Fewer samples than bars are stretched, never invented. The
 * web adapter's own function, so a take draws the same before upload on both.
 */
export function bucketPeaks(
  envelope: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  if (envelope.length === 0) return new Array<number>(count).fill(0);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * envelope.length) / count);
    const to = Math.max(
      from + 1,
      Math.floor(((i + 1) * envelope.length) / count),
    );
    let peak = 0;
    for (let j = from; j < to && j < envelope.length; j++)
      peak = Math.max(peak, envelope[j] ?? 0);
    out.push(Math.min(1, Math.max(0, peak)));
  }
  return out;
}
