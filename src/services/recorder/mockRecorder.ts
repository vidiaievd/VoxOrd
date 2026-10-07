import {
  flatLevels,
  METER_BANDS,
  type Capture,
  type InterruptReason,
  type OpenResult,
  type RecorderPort,
} from './port';

/** A port with a hand on every lever, for tests — the web's `mock-recorder.ts` on a phone. */
export interface MockRecorder extends RecorderPort {
  /** What the next `open` answers. */
  openResult: OpenResult;
  /** What the next `start` answers. */
  startResult: OpenResult;
  /** Seconds the next take reports; the take's path counts up from `/cache/take-1.m4a`. */
  seconds: number;
  /** Set the loudness the meter and the level check hear. */
  setLevel(value: number): void;
  /** Interrupt from the hardware's side. */
  interrupt(reason: InterruptReason): void;
  calls: string[];
  recording: boolean;
}

export function createMockRecorder(): MockRecorder {
  let opened = false;
  let level = 0;
  let taken = 0;
  const listeners = new Set<(reason: InterruptReason) => void>();

  const mock: MockRecorder = {
    openResult: 'ok',
    startResult: 'ok',
    seconds: 20,
    calls: [],
    recording: false,
    async open() {
      mock.calls.push('open');
      if (mock.openResult === 'ok') opened = true;
      return mock.openResult;
    },
    isOpen: () => opened,
    meter(on) {
      mock.calls.push(on ? 'meter:on' : 'meter:off');
    },
    level: () => level,
    levels: () =>
      level === 0 ? flatLevels() : new Array<number>(METER_BANDS).fill(level),
    async start() {
      mock.calls.push('start');
      if (mock.startResult === 'ok') mock.recording = true;
      return mock.startResult;
    },
    async stop(): Promise<Capture | null> {
      mock.calls.push('stop');
      if (!mock.recording) return null;
      mock.recording = false;
      taken += 1;
      return {
        path: `/cache/take-${taken}.m4a`,
        mimeType: 'audio/mp4',
        seconds: mock.seconds,
        size: Math.round(mock.seconds * 3072),
        envelope: [0.2, 0.6, 0.4],
      };
    },
    cancel() {
      mock.calls.push('cancel');
      mock.recording = false;
    },
    close() {
      mock.calls.push('close');
      opened = false;
    },
    onInterrupt(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLevel(value) {
      level = value;
    },
    interrupt(reason) {
      listeners.forEach(l => l(reason));
    },
  };
  return mock;
}
