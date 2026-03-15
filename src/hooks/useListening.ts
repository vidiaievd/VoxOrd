import { useState, useCallback, useEffect, useRef } from 'react';
import Tts from 'react-native-tts';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import { wordModeStrengthRepository } from '../repositories/WordModeStrengthRepository';
import { listeningRepository } from '../repositories/ListeningRepository';

export interface ListeningQuestion {
  wordId: number;
  word: string;
  correctAnswer: string;
  options: string[];
}

export type TtsStatus = 'initializing' | 'ready' | 'error' | 'no_engine';

export interface ListeningState {
  questions: ListeningQuestion[];
  currentIndex: number;
  selectedOption: string | null;
  isAnswered: boolean;
  isCorrect: boolean | null;
  correctCount: number;
  isComplete: boolean;
  isSpeaking: boolean;
  ttsStatus: TtsStatus;
  totalWords: number;
}

export interface UseListeningResult {
  state: ListeningState;
  isLoading: boolean;
  speak: () => void;
  selectOption: (option: string) => void;
  next: () => void;
  installTts: () => void;
  sessionId: number | null;
}

const SPEECH_LANG = 'no-NO';
const SPEECH_RATE = 0.5;

export function useListening(
  deckId: number,
  overrideWordIds?: number[],
  onComplete?: (correctCount: number) => void,
): UseListeningResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const queueRef = useRef<ListeningQuestion[]>([]);
  const [state, setState] = useState<ListeningState>({
    questions: [],
    currentIndex: 0,
    selectedOption: null,
    isAnswered: false,
    isCorrect: null,
    correctCount: 0,
    isComplete: false,
    isSpeaking: false,
    ttsStatus: 'initializing',
    totalWords: 0,
  });

  // TTS init — unchanged
  useEffect(() => {
    Tts.getInitStatus().then(
      () => {
        Tts.setDefaultLanguage(SPEECH_LANG).catch(() => {
          console.warn('[TTS] no-NO not available, using system default');
        });
        Tts.setDefaultRate(SPEECH_RATE);
        setState(prev => ({ ...prev, ttsStatus: 'ready' }));
      },
      (err: { code?: string }) => {
        if (err.code === 'no_engine') {
          setState(prev => ({ ...prev, ttsStatus: 'no_engine' }));
        } else {
          setState(prev => ({ ...prev, ttsStatus: 'error' }));
        }
      },
    );

    const onStart = () => setState(prev => ({ ...prev, isSpeaking: true }));
    const onFinish = () => setState(prev => ({ ...prev, isSpeaking: false }));
    const onCancel = () => setState(prev => ({ ...prev, isSpeaking: false }));

    Tts.addEventListener('tts-start', onStart);
    Tts.addEventListener('tts-finish', onFinish);
    Tts.addEventListener('tts-cancel', onCancel);

    return () => {
      Tts.removeEventListener('tts-start', onStart);
      Tts.removeEventListener('tts-finish', onFinish);
      Tts.removeEventListener('tts-cancel', onCancel);
      Tts.stop();
    };
  }, []);

  // Load questions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, questions] = await Promise.all([
        sessionRepository.create('quick', deckId),
        listeningRepository.getQuestionsForDeck(deckId, 'ru', overrideWordIds),
      ]);
      if (!cancelled) {
        queueRef.current = [...questions];
        setSessionId(sid);
        setState(prev => ({
          ...prev,
          questions,
          totalWords: questions.length,
        }));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, JSON.stringify(overrideWordIds)]);

  // Auto-play when question changes AND tts is ready — unchanged
  useEffect(() => {
    if (
      !isLoading &&
      state.ttsStatus === 'ready' &&
      state.questions.length > 0
    ) {
      const question = state.questions[state.currentIndex];
      if (question) {
        const timer = setTimeout(() => Tts.speak(question.word), 400);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, state.currentIndex, state.ttsStatus]);

  const speak = useCallback(() => {
    if (state.ttsStatus !== 'ready') return;
    const question = state.questions[state.currentIndex];
    if (!question) return;
    Tts.stop();
    Tts.speak(question.word);
  }, [state.questions, state.currentIndex, state.ttsStatus]);

  const installTts = useCallback(() => {
    Tts.requestInstallEngine();
  }, []);

  const selectOption = useCallback(
    (option: string) => {
      setState(prev => {
        if (prev.isAnswered) return prev;

        const question = prev.questions[prev.currentIndex];
        const isCorrect = option === question.correctAnswer;

        progressRepository.recordAnswer(question.wordId, deckId, isCorrect);
        wordModeStrengthRepository.recordAnswer(
          question.wordId,
          deckId,
          'listening',
          isCorrect,
        );
        if (sessionId) {
          sessionRepository.recordResult({
            sessionId,
            wordId: question.wordId,
            exerciseType: 'listening',
            isCorrect,
            responseTimeMs: null,
          });
        }

        // If wrong — push to end of queue for retry
        if (!isCorrect) {
          queueRef.current.push(question);
        }

        return {
          ...prev,
          selectedOption: option,
          isAnswered: true,
          isCorrect,
          correctCount: isCorrect ? prev.correctCount + 1 : prev.correctCount,
        };
      });
    },
    [deckId, sessionId],
  );

  const next = useCallback(() => {
    let shouldComplete = false;
    let finalCorrectCount = 0;

    Tts.stop();
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      const nextQuestion = queueRef.current[nextIndex];
      const isComplete = !nextQuestion;

      if (isComplete && sessionId) {
        sessionRepository.finish(sessionId, {
          totalWords: prev.totalWords,
          correctAnswers: prev.correctCount,
          sessionType: 'quick',
        });
        shouldComplete = true;
        finalCorrectCount = prev.correctCount;
      }

      return {
        ...prev,
        questions: isComplete ? prev.questions : queueRef.current,
        currentIndex: nextIndex,
        selectedOption: null,
        isAnswered: false,
        isCorrect: null,
        isComplete,
      };
    });

    if (shouldComplete) {
      onComplete?.(finalCorrectCount);
    }
  }, [sessionId, onComplete]);

  return { state, isLoading, sessionId, speak, selectOption, next, installTts };
}
