import { useState, useCallback, useEffect, useRef } from 'react';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import { wordModeStrengthRepository } from '../repositories/WordModeStrengthRepository';
import { quizRepository } from '../repositories/QuizRepository';

export interface QuizQuestion {
  wordId: number;
  word: string;
  correctAnswer: string;
  options: string[];
}

export interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedOption: string | null;
  isAnswered: boolean;
  isCorrect: boolean;
  correctCount: number;
  isComplete: boolean;
  totalWords: number;
}

export interface UseQuizResult {
  state: QuizState;
  isLoading: boolean;
  sessionId: number | null;
  selectOption: (option: string) => void;
  next: () => void;
}

export function useQuiz(
  deckId: number,
  overrideWordIds?: number[],
  onComplete?: (correctCount: number) => void,
): UseQuizResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  // Mutable queue — wrong answers get appended to end, no re-render on mutation
  const queueRef = useRef<QuizQuestion[]>([]);
  const [state, setState] = useState<QuizState>({
    questions: [],
    currentIndex: 0,
    selectedOption: null,
    isAnswered: false,
    isCorrect: false,
    correctCount: 0,
    isComplete: false,
    totalWords: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, questions] = await Promise.all([
        sessionRepository.create('quick', deckId),
        quizRepository.getQuestionsForDeck(deckId, 'ru', overrideWordIds),
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
          'quiz',
          isCorrect,
        );

        if (sessionId) {
          sessionRepository.recordResult({
            sessionId,
            wordId: question.wordId,
            exerciseType: 'quiz',
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

        // Flag for calling onComplete outside setState
        shouldComplete = true;
        finalCorrectCount = prev.correctCount;
      }

      return {
        ...prev,
        questions: isComplete ? prev.questions : queueRef.current,
        currentIndex: nextIndex,
        selectedOption: null,
        isAnswered: false,
        isCorrect: false,
        isComplete,
      };
    });

    // Call onComplete outside setState to avoid side effect in reducer
    if (shouldComplete) {
      onComplete?.(finalCorrectCount);
    }
  }, [sessionId, onComplete]);

  return { state, isLoading, sessionId, selectOption, next };
}
