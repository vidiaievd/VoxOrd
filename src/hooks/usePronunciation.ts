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
  onComplete?: (correctCount: number) => void;
  skip: () => void;
}

const SPEECH_LANG = 'no-NO';
const SPEECH_RATE = 0.45;
const PASS_THRESHOLD = 60; // overall score >= 60 counts as correct

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
        setState(prev => ({
          ...prev,
          items,
          totalItems: items.length,
        }));
        setIsLoading(false);
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
      setState(prev => ({ ...prev, recordingState: 'listening', error: null }));
    };

    asr.onPartial = transcript => {
      setState(prev => ({ ...prev, transcript }));
    };

    asr.onResult = result => {
      setState(prev => {
        const item = prev.items[prev.currentIndex];
        if (!item) return prev;

        const score = scorerRef.current.score(result.transcript, item.text);
        const isCorrect = score.overall >= PASS_THRESHOLD;

        pronunciationRepository.recordResult({
          wordId: item.type === 'word' ? item.referenceId : null,
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
      // Ignore no-match — user just didn't say anything
      if (error.message === 'no-match' || error.message === 'speech-timeout') {
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
    Tts.stop();
    setTimeout(() => Tts.speak(normalizeForSpeech(item.text)), 100);
    return { ...prev, isSpeaking: true };
  });
}, []);

  const skip = useCallback(() => {
    // Record as incorrect
    const item = itemsRef.current[state.currentIndex];
    if (item?.type === 'word') {
      pronunciationRepository.recordResult({
        wordId: item.referenceId,
        deckId,
        score: 0,
        isCorrect: false,
      });
    }
    // Move to next without changing correctCount
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.items.length) {
        setTimeout(() => onComplete?.(prev.correctCount), 0);
        return { ...prev, isComplete: true, recordingState: 'idle' };
      }
      return {
        ...prev,
        currentIndex: nextIndex,
        recordingState: 'idle',
        transcript: null,
        score: null,
        error: null,
      };
    });
  }, [deckId, onComplete, state.currentIndex]);

  const startRecord = useCallback(async () => {
    const asr = asrRef.current;
    const hasPermission = await asr.hasPermission();
    if (!hasPermission) {
      setState(prev => ({ ...prev, error: 'not-allowed' }));
      return;
    }

    Tts.stop();

    setState(prev => {
      return {
        ...prev,
        transcript: null,
        score: null,
        recordingState: 'listening',
        error: null,
      };
    });

    // Pass current word as contextual hint for better accuracy
    const item = itemsRef.current[state.currentIndex];
    asr.start({
  lang:              'nb-NO',
  contextualStrings: item ? [normalizeForSpeech(item.text)] : [],
  interimResults:    true,
});
  }, [state.currentIndex]);

  const stopRecord = useCallback(() => {
    asrRef.current.stop();
    setState(prev => ({ ...prev, recordingState: 'processing' }));
  }, []);

  const next = useCallback(() => {
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.items.length) {
        let shouldComplete = false;
        const finalCorrect = prev.correctCount;

        setTimeout(() => {
          if (shouldComplete) onComplete?.(finalCorrect);
        }, 0);
        shouldComplete = true;

        return {
          ...prev,
          isComplete: true,
          recordingState: 'idle',
          transcript: null,
          score: null,
        };
      }

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
    setState(prev => ({
      ...prev,
      recordingState: 'idle',
      transcript: null,
      score: null,
      error: null,
    }));
  }, []);

  return { state, isLoading, speak, startRecord, stopRecord, next, retry, skip };
}
