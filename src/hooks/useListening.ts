import { useState, useCallback, useEffect } from 'react';
import Tts from 'react-native-tts';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';

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
}

export interface UseListeningResult {
  state: ListeningState;
  isLoading: boolean;
  speak: () => void;
  selectOption: (option: string) => void;
  next: () => void;
  installTts: () => void;
}

const QUESTION_COUNT = 7;
const OPTIONS_COUNT = 4;
const SPEECH_LANG = 'no-NO';
const SPEECH_RATE = 0.5;

async function loadQuestions(
  deckId: number,
  uiLang: string = 'ru',
): Promise<ListeningQuestion[]> {
  const db = getDatabase();

  const poolResult = await db.execute(
    `SELECT DISTINCT
       w.id     AS wordId,
       w.word,
       t.translation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
     ORDER BY RANDOM();`,
    [deckId, uiLang],
  );

  const pool = (poolResult.rows ?? []).map(row => ({
    wordId: row.wordId as number,
    word: row.word as string,
    translation: row.translation as string,
  }));

  if (pool.length < OPTIONS_COUNT) return [];

  const questionWords = pool.slice(0, QUESTION_COUNT);

  return questionWords.map(target => {
    const distractors = pool
      .filter(p => p.wordId !== target.wordId)
      .sort(() => Math.random() - 0.5)
      .slice(0, OPTIONS_COUNT - 1)
      .map(p => p.translation);

    const options = [target.translation, ...distractors].sort(
      () => Math.random() - 0.5,
    );

    return {
      wordId: target.wordId,
      word: target.word,
      correctAnswer: target.translation,
      options,
    };
  });
}

export function useListening(deckId: number): UseListeningResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
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
  });

  // Init TTS engine — must wait for getInitStatus before speaking
  useEffect(() => {
    Tts.getInitStatus().then(
      () => {
        Tts.setDefaultLanguage(SPEECH_LANG).catch(() => {
          // no-NO may not be installed — continue with system default
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

    // Event listeners — react-native-tts uses removeEventListener (no .remove())
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
        loadQuestions(deckId),
      ]);
      if (!cancelled) {
        setSessionId(sid);
        setState(prev => ({ ...prev, questions }));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Auto-play when question changes AND tts is ready
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
        if (sessionId) {
          sessionRepository.recordResult({
            sessionId,
            wordId: question.wordId,
            exerciseType: 'listening',
            isCorrect,
            responseTimeMs: null,
          });
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
    Tts.stop();
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      const isComplete = nextIndex >= prev.questions.length;

      if (isComplete && sessionId) {
        sessionRepository.finish(sessionId, {
          totalWords: prev.questions.length,
          correctAnswers: prev.correctCount,
          sessionType: 'quick',
        });
      }

      return {
        ...prev,
        currentIndex: nextIndex,
        selectedOption: null,
        isAnswered: false,
        isCorrect: null,
        isComplete,
      };
    });
  }, [sessionId]);

  return { state, isLoading, speak, selectOption, next, installTts };
}
