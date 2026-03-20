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

    console.log(
      '[ASR] start → lang:',
      options.lang,
      'contextualStrings:',
      options.contextualStrings,
    );

    this.subscriptions.push(
      emitter.addListener('SpeechRecognition.start', () => {
        console.log('[ASR] ← SpeechRecognition.start (ready for speech)');
        this.onStart?.();
      }),

      emitter.addListener('SpeechRecognition.result', e => {
        console.log(
          '[ASR] ← SpeechRecognition.result',
          '| isFinal:',
          e.isFinal,
          '| transcript:',
          e.transcript,
          '| confidence:',
          e.confidence,
        );
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
        console.log(
          '[ASR] ← SpeechRecognition.error',
          '| message:',
          e.message,
          '| code:',
          e.code,
        );
        this.onError?.({ code: String(e.code), message: e.message });
      }),

      emitter.addListener('SpeechRecognition.end', () => {
        console.log('[ASR] ← SpeechRecognition.end');
        this.onEnd?.();
      }),
    );

    SpeechRecognition.start(options.lang, options.contextualStrings ?? []);
  }

  stop(): void {
    console.log('[ASR] stop called');
    SpeechRecognition.stop();
  }

  destroy(): void {
    console.log('[ASR] destroy called');
    this.stop();
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
  }
}
