import { useState, useCallback, useEffect, useRef } from 'react';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';

export interface QuizQuestion {
  wordId: number;
  word: string;
  correctAnswer: string;
  options: string[]; // 4 options, shuffled
}

export interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedOption: string | null;
  isAnswered: boolean;
  isCorrect: boolean;
  correctCount: number;
  isComplete: boolean;
}

export interface UseQuizResult {
  state: QuizState;
  isLoading: boolean;
  sessionId: number | null;
  selectOption: (option: string) => void;
  next: () => void;
}

const QUESTION_COUNT = 7;
const OPTIONS_COUNT = 4;

async function loadQuestions(
  deckId: number,
  uiLang: string = 'ru',
  overrideWordIds?: number[],
): Promise<QuizQuestion[]> {
  const db = getDatabase();

  const wordFilter =
    overrideWordIds && overrideWordIds.length > 0
      ? `AND w.id IN (${overrideWordIds.join(',')})`
      : '';

  // Load all available translations for this deck as option pool
  const poolResult = await db.execute(
    `SELECT DISTINCT
       w.id     AS wordId,
       w.word,
       t.translation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
     ${wordFilter}
     ORDER BY RANDOM();`,
    [deckId, uiLang],
  );

  const pool = (poolResult.rows ?? []).map(row => ({
    wordId: row.wordId as number,
    word: row.word as string,
    translation: row.translation as string,
  }));

  if (pool.length < OPTIONS_COUNT) return [];

  // Pick question words (up to QUESTION_COUNT)
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

export function useQuiz(
  deckId: number,
  overrideWordIds?: number[],
  onWeakIds?: (weakIds: number[], correct: number) => void,
): UseQuizResult {
  const weakIdsRef = useRef(new Set<number>());
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<QuizState>({
    questions: [],
    currentIndex: 0,
    selectedOption: null,
    isAnswered: false,
    correctCount: 0,
    isComplete: false,
    isCorrect: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, questions] = await Promise.all([
        sessionRepository.create('quick', deckId),
        loadQuestions(deckId, 'ru', overrideWordIds),
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
  }, [deckId, overrideWordIds]);

  const selectOption = useCallback(
    (option: string) => {
      setState(prev => {
        if (prev.isAnswered) return prev;

        const question = prev.questions[prev.currentIndex];
        const isCorrect = option === question.correctAnswer;

        // Record answer async — fire and forget
        progressRepository.recordAnswer(question.wordId, deckId, isCorrect);
        if (sessionId) {
          sessionRepository.recordResult({
            sessionId,
            wordId: question.wordId,
            exerciseType: 'quiz',
            isCorrect,
            responseTimeMs: null,
          });
        }

        if (!isCorrect) {
          weakIdsRef.current.add(question.wordId);
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
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      const isComplete = nextIndex >= prev.questions.length;

      if (isComplete && sessionId) {
        sessionRepository.finish(sessionId, {
          totalWords: prev.questions.length,
          correctAnswers: prev.correctCount,
          sessionType: 'quick',
        });
        // Report weak words to deep session orchestrator
        onWeakIds?.(Array.from(weakIdsRef.current), prev.correctCount);
      }

      return {
        ...prev,
        currentIndex: nextIndex,
        selectedOption: null,
        isAnswered: false,
        isComplete,
        isCorrect: false,
      };
    });
  }, [onWeakIds, sessionId]);

  return { state, isLoading, sessionId, selectOption, next };
}
