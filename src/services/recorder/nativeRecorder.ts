import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {
  flatLevels,
  METER_BANDS,
  type Capture,
  type InterruptReason,
  type OpenResult,
  type RecorderPort,
} from './port';

/** The native module's surface — `android/.../audio/AudioRecorderModule.kt`. */
interface AudioRecorderNative {
  probe(): Promise<OpenResult>;
  startMeter(): Promise<OpenResult>;
  stopMeter(): void;
  start(): Promise<OpenResult>;
  stop(): Promise<Capture | null>;
  cancel(): void;
  close(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const native: AudioRecorderNative | undefined = NativeModules.AudioRecorder;

/**
 * The phone's microphone for `read_aloud` — Android only, as speech recognition is (Q3-A).
 *
 * Without the native module — iOS, or a build that predates it — every `open` answers
 * `noDevice`, which the runner shows as «no microphone» with a retry rather than a crash
 * (plan 70 §8 item 10, the browser's case for a missing `MediaRecorder`).
 *
 * The permission is asked here, in JS, the way `ReactNativeASR` asks it; a refusal is `denied`.
 * The app going to the background is an interruption too (`hidden`), seen through `AppState`.
 */
export function createNativeRecorder(): RecorderPort {
  let opened = false;
  let current = 0;
  let history = flatLevels();
  const listeners = new Set<(reason: InterruptReason) => void>();
  const subscriptions: { remove: () => void }[] = [];

  const tell = (reason: InterruptReason) => listeners.forEach(l => l(reason));

  if (native) {
    const emitter = new NativeEventEmitter(native as never);
    subscriptions.push(
      emitter.addListener('AudioRecorder.level', (e: { value?: number }) => {
        current = typeof e.value === 'number' ? e.value : 0;
        history = [...history.slice(1), current];
      }),
      emitter.addListener(
        'AudioRecorder.interrupted',
        (e: { reason?: string }) => {
          tell(e.reason === 'deviceChanged' ? 'deviceChanged' : 'ended');
        },
      ),
    );
  }
  subscriptions.push(
    AppState.addEventListener('change', state => {
      if (state === 'background') tell('hidden');
    }),
  );

  const rest = () => {
    current = 0;
    history = flatLevels();
  };

  return {
    async open() {
      if (opened) return 'ok';
      if (!native || Platform.OS !== 'android') return 'noDevice';
      const answer = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (answer !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
      const result = await native.probe();
      opened = result === 'ok';
      return result;
    },
    isOpen: () => opened,
    meter(on) {
      if (!native || !opened) return;
      rest();
      if (on) void native.startMeter();
      else native.stopMeter();
    },
    level: () => current,
    levels: () =>
      history.length === METER_BANDS ? [...history] : flatLevels(),
    async start() {
      if (!native) return 'noDevice';
      rest();
      return native.start();
    },
    async stop() {
      if (!native) return null;
      const capture = await native.stop();
      rest();
      return capture;
    },
    cancel() {
      native?.cancel();
      rest();
    },
    close() {
      native?.close();
      subscriptions.forEach(s => s.remove());
      subscriptions.length = 0;
      listeners.clear();
      opened = false;
      rest();
    },
    onInterrupt(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
