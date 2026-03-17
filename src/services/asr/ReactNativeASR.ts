import {
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { ASRService, ASRResult, ASRError, ASRStartOptions } from './ASRService';

const { SpeechRecognition } = NativeModules;
const emitter = new NativeEventEmitter(SpeechRecognition);

export class ReactNativeASR implements ASRService {
  onStart?: () => void;
  onResult?: (result: ASRResult) => void;
  onPartial?: (transcript: string) => void;
  onError?: (error: ASRError) => void;
  onEnd?: () => void;

  private subscriptions: { remove: () => void }[] = [];

  isAvailable(): Promise<boolean> {
    return SpeechRecognition.isAvailable();
  }

  async hasPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  start(options: ASRStartOptions): void {
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];

    this.subscriptions.push(
      emitter.addListener('SpeechRecognition.start', () => {
        this.onStart?.();
      }),
      emitter.addListener('SpeechRecognition.result', e => {
        if (e.isFinal) {
          this.onResult?.({
            transcript: e.transcript,
            confidence: e.confidence ?? 0,
          });
        } else {
          this.onPartial?.(e.transcript);
        }
      }),
      emitter.addListener('SpeechRecognition.error', e => {
        this.onError?.({ code: String(e.code), message: e.message });
      }),
      emitter.addListener('SpeechRecognition.end', () => {
        this.onEnd?.();
      }),
    );

    SpeechRecognition.start(options.lang, options.contextualStrings ?? []);
  }

  stop(): void {
    SpeechRecognition.stop();
  }

  destroy(): void {
    this.stop();
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
  }
}
