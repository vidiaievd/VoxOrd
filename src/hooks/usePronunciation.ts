import { useState, useCallback, useEffect, useRef } from 'react';
import Tts from 'react-native-tts';
import {
  pronunciationRepository,
  PronunciationItem,
} from '../repositories/PronunciationRepository';
import { createASRService } from '../services/asr';
import {
  createPronunciationScorer,
  PronunciationScore,
} from '../services/asr/pronunciation';
import { normalizeForSpeech } from '../utils/text';

export type PronunciationMode = 'words' | 'phrases' | 'mixed';
export type RecordingState = 'idle' | 'listening' | 'processing' | 'result';

export interface PronunciationState {
  items: PronunciationItem[];
  currentIndex: number;
  totalItems: number;
  recordingState: RecordingState;
  transcript: string | null;
  score: PronunciationScore | null;
  correctCount: number;
  isComplete: boolean;
  ttsReady: boolean;
  isSpeaking: boolean;
  error: string | null;
}

export interface UsePronunciationResult {
  state: PronunciationState;
  isLoading: boolean;
  speak: () => void;
  startRecord: () => void;
  stopRecord: () => void;
  next: () => void;
  retry: () => void;
  skip: () => void;
}

const SPEECH_LANG = 'no-NO';
const SPEECH_RATE = 0.45;
const PASS_THRESHOLD = 60;

const IGNORED_ASR_ERRORS = [
  'no-match',
  'speech-timeout',
  'unknown',
  'client',
  'error_no_match',
  'error_speech_timeout',
  'error_client',
];

export function usePronunciation(
  deckId: number,
  mode: PronunciationMode = 'mixed',
  overrideIds?: number[],
  onComplete?: (correctCount: number) => void,
): UsePronunciationResult {
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<PronunciationState>({
    items: [],
    currentIndex: 0,
    totalItems: 0,
    recordingState: 'idle',
    transcript: null,
    score: null,
    correctCount: 0,
    isComplete: false,
    ttsReady: false,
    isSpeaking: false,
    error: null,
  });

  const asrRef = useRef(createASRService('free'));
  const scorerRef = useRef(createPronunciationScorer('free'));
  const itemsRef = useRef<PronunciationItem[]>([]);
  const indexRef = useRef(0); // sync ref — avoids stale closure in startRecord/skip

  // TTS init
  useEffect(() => {
    Tts.getInitStatus().then(
      () => {
        Tts.setDefaultLanguage(SPEECH_LANG).catch(() => {});
        Tts.setDefaultRate(SPEECH_RATE);
        setState(prev => ({ ...prev, ttsReady: true }));
      },
      () => setState(prev => ({ ...prev, ttsReady: false })),
    );
    return () => {
      Tts.stop();
    };
  }, []);

  // Load items
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const items = await pronunciationRepository.getItemsForDeck(
        deckId,
        mode,
        20,
      );
      if (!cancelled) {
        itemsRef.current = items;
        indexRef.current = 0;
        setState(prev => ({ ...prev, items, totalItems: items.length }));
        setIsLoading(false);
        console.log(
          '[Pronunciation] loaded:',
          items.length,
          'items | mode:',
          mode,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, mode]);

  // ASR setup
  useEffect(() => {
    const asr = asrRef.current;

    asr.onStart = () => {
      console.log('[Pronunciation] asr.onStart → listening');
      setState(prev => ({ ...prev, recordingState: 'listening', error: null }));
    };

    asr.onPartial = transcript => {
      console.log('[Pronunciation] asr.onPartial:', transcript);
      setState(prev => ({ ...prev, transcript }));
    };

    asr.onResult = result => {
      console.log(
        '[Pronunciation] asr.onResult',
        '| transcript:',
        result.transcript,
        '| confidence:',
        result.confidence,
      );

      setState(prev => {
        const currentItem = prev.items[prev.currentIndex];
        if (!currentItem) {
          console.warn(
            '[Pronunciation] onResult — no item at index',
            prev.currentIndex,
          );
          return prev;
        }

        // Strip punctuation from reference — ASR never returns punctuation
        const reference = normalizeForSpeech(currentItem.text)
          .replace(/[.,!?]/g, '')
          .trim();

        console.log(
          '[Pronunciation] scoring',
          '| transcript:',
          result.transcript,
          '| reference:',
          reference,
        );

        const score = scorerRef.current.score(result.transcript, reference);
        const isCorrect = score.overall >= PASS_THRESHOLD;

        console.log(
          '[Pronunciation] score:',
          score.overall,
          '| accuracy:',
          score.accuracy,
          '| fluency:',
          score.fluency,
          '| isCorrect:',
          isCorrect,
        );

        pronunciationRepository.recordResult({
          wordId: currentItem.type === 'word' ? currentItem.referenceId : null,
          deckId,
          score: score.overall,
          isCorrect,
        });

        return {
          ...prev,
          transcript: result.transcript,
          score,
          recordingState: 'result',
          correctCount: isCorrect ? prev.correctCount + 1 : prev.correctCount,
        };
      });
    };

    asr.onError = error => {
      console.log(
        '[Pronunciation] asr.onError | message:',
        error.message,
        '| code:',
        error.code,
      );

      if (IGNORED_ASR_ERRORS.includes(error.message.toLowerCase())) {
        console.log('[Pronunciation] error ignored → reset to idle');
        setState(prev => ({ ...prev, recordingState: 'idle', error: null }));
        return;
      }

      setState(prev => ({
        ...prev,
        recordingState: 'idle',
        error: error.message,
      }));
    };

    asr.onEnd = () => {
      console.log('[Pronunciation] asr.onEnd');
      setState(prev =>
        prev.recordingState === 'listening'
          ? { ...prev, recordingState: 'processing' }
          : prev,
      );
    };

    return () => {
      asr.destroy();
    };
  }, [deckId]);

  const speak = useCallback(() => {
    setState(prev => {
      const item = prev.items[prev.currentIndex];
      if (!item || !prev.ttsReady) return prev;
      const text = normalizeForSpeech(item.text);
      console.log('[Pronunciation] speak:', text);
      Tts.stop();
      setTimeout(() => Tts.speak(text), 100);
      return { ...prev, isSpeaking: true };
    });
  }, []);

  const startRecord = useCallback(async () => {
    const asr = asrRef.current;
    const hasPermission = await asr.hasPermission();
    if (!hasPermission) {
      console.warn('[Pronunciation] startRecord — no permission');
      setState(prev => ({ ...prev, error: 'not-allowed' }));
      return;
    }

    Tts.stop();

    // Use indexRef to avoid stale closure
    const item = itemsRef.current[indexRef.current];
    const contextualStrings = item ? [normalizeForSpeech(item.text)] : [];

    console.log(
      '[Pronunciation] startRecord | index:',
      indexRef.current,
      '| item:',
      item?.text ?? 'n/a',
      '| contextualStrings:',
      contextualStrings,
    );

    setState(prev => ({
      ...prev,
      transcript: null,
      score: null,
      recordingState: 'listening',
      error: null,
    }));

    asr.start({ lang: 'nb-NO', contextualStrings, interimResults: true });
  }, []); // no deps — reads live values via refs

  const stopRecord = useCallback(() => {
    console.log('[Pronunciation] stopRecord');
    asrRef.current.stop();
    setState(prev => ({ ...prev, recordingState: 'processing' }));
  }, []);

  const next = useCallback(() => {
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      console.log(
        '[Pronunciation] next → index:',
        nextIndex,
        '| total:',
        prev.items.length,
      );

      if (nextIndex >= prev.items.length) {
        const finalCorrect = prev.correctCount;
        setTimeout(() => onComplete?.(finalCorrect), 0);
        return {
          ...prev,
          isComplete: true,
          recordingState: 'idle',
          transcript: null,
          score: null,
        };
      }

      indexRef.current = nextIndex;
      return {
        ...prev,
        currentIndex: nextIndex,
        recordingState: 'idle',
        transcript: null,
        score: null,
        error: null,
      };
    });
  }, [onComplete]);

  const retry = useCallback(() => {
    console.log('[Pronunciation] retry');
    setState(prev => ({
      ...prev,
      recordingState: 'idle',
      transcript: null,
      score: null,
      error: null,
    }));
  }, []);

  const skip = useCallback(() => {
    const item = itemsRef.current[indexRef.current];
    console.log('[Pronunciation] skip | item:', item?.text ?? 'n/a');

    if (item?.type === 'word') {
      pronunciationRepository.recordResult({
        wordId: item.referenceId,
        deckId,
        score: 0,
        isCorrect: false,
      });
    }

    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.items.length) {
        setTimeout(() => onComplete?.(prev.correctCount), 0);
        return { ...prev, isComplete: true, recordingState: 'idle' };
      }
      indexRef.current = nextIndex;
      return {
        ...prev,
        currentIndex: nextIndex,
        recordingState: 'idle',
        transcript: null,
        score: null,
        error: null,
      };
    });
  }, [deckId, onComplete]);

  return {
    state,
    isLoading,
    speak,
    startRecord,
    stopRecord,
    next,
    retry,
    skip,
  };
}
