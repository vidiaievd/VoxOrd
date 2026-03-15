import { NativeModules, NativeEventEmitter } from 'react-native';

const { SpeechRecognition } = NativeModules;
const emitter = new NativeEventEmitter(SpeechRecognition);

export interface SpeechResult {
  transcript: string;
  confidence: number;
  isFinal:    boolean;
}

export interface SpeechError {
  code:    number;
  message: string;
}

export const NativeSpeech = {
  isAvailable: (): Promise<boolean> =>
    SpeechRecognition.isAvailable(),

  hasPermission: (): Promise<boolean> =>
    SpeechRecognition.hasPermission(),

  start: (lang: string, contextualStrings: string[] = []) =>
    SpeechRecognition.start(lang, contextualStrings),

  stop: () =>
    SpeechRecognition.stop(),

  onStart:  (cb: () => void) =>
    emitter.addListener('SpeechRecognition.start', cb),

  onResult: (cb: (result: SpeechResult) => void) =>
    emitter.addListener('SpeechRecognition.result', cb),

  onError:  (cb: (error: SpeechError) => void) =>
    emitter.addListener('SpeechRecognition.error', cb),

  onEnd:    (cb: () => void) =>
    emitter.addListener('SpeechRecognition.end', cb),
};