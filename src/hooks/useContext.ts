import { useState, useCallback, useEffect, useRef } from 'react';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import type { ExerciseTracking } from './exerciseTracking';

export interface ContextQuestion {
  wordId: number;
  word: string;
  sentence: string; // Norwegian sentence with ___
  sentenceTranslation: string; // translated sentence with ___
  correctAnswer: string; // the word itself
  options: string[]; // 4 options
}

export interface ContextState {
  questions: ContextQuestion[];
  currentIndex: number;
  selectedOption: string | null;
  isAnswered: boolean;
  isCorrect: boolean | null;
  correctCount: number;
  isComplete: boolean;
}

export interface UseContextResult {
  state: ContextState;
  isLoading: boolean;
  sessionId: number | null;
  selectOption: (option: string) => void;
  next: () => void;
}

const QUESTION_COUNT = 7;
const OPTIONS_COUNT = 4;
const GAP_MARKER = '___';

async function loadQuestions(
  deckId: number,
  uiLang: string = 'ru',
): Promise<ContextQuestion[]> {
  const db = getDatabase();

  // Load words that have context sentences
  const result = await db.execute(
    `SELECT
       w.id          AS wordId,
       w.word,
       e.sentence,
       et.translation AS sentenceTranslation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId  = w.id AND dw.deckId = ?
     JOIN ${TABLE.WORD_EXAMPLES} e  ON e.wordId  = w.id AND e.isContextSentence = 1
     LEFT JOIN ${TABLE.WORD_EXAMPLE_TRANSLATIONS} et
       ON et.exampleId = e.id AND et.languageCode = ?
     ORDER BY RANDOM()
     LIMIT ?;`,
    [deckId, uiLang, QUESTION_COUNT],
  );

  if ((result.rows ?? []).length === 0) return [];

  // Load all words for distractor options
  const poolResult = await db.execute(
    `SELECT w.id AS wordId, w.word
     FROM ${TABLE.WORDS}      w
     JOIN ${TABLE.DECK_WORDS} dw ON dw.wordId = w.id AND dw.deckId = ?
     ORDER BY RANDOM();`,
    [deckId],
  );

  const pool = (poolResult.rows ?? []).map(r => ({
    wordId: r.wordId as number,
    word: r.word as string,
  }));

  return (result.rows ?? []).map(row => {
    const wordId = row.wordId as number;
    const word = row.word as string;
    const sentence = row.sentence as string;
    const sentenceTranslation = (row.sentenceTranslation ?? sentence) as string;

    const distractors = pool
      .filter(p => p.wordId !== wordId)
      .sort(() => Math.random() - 0.5)
      .slice(0, OPTIONS_COUNT - 1)
      .map(p => p.word);

    const options = [word, ...distractors].sort(() => Math.random() - 0.5);

    // Ensure sentence has gap marker
    const gappedSentence = sentence.includes(GAP_MARKER)
      ? sentence
      : sentence.replace(new RegExp(word, 'i'), GAP_MARKER);

    return {
      wordId,
      word,
      sentence: gappedSentence,
      sentenceTranslation,
      correctAnswer: word,
      options,
    };
  });
}

export function useContext(
  deckId: number,
  tracking?: ExerciseTracking,
): UseContextResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  // Read through a ref so a caller passing an inline object does not need to
  // memoize it just to keep selectOption stable.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;
  const [state, setState] = useState<ContextState>({
    questions: [],
    currentIndex: 0,
    selectedOption: null,
    isAnswered: false,
    isCorrect: null,
    correctCount: 0,
    isComplete: false,
  });

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

  const selectOption = useCallback(
    (option: string) => {
      let answered: { wordId: number; isCorrect: boolean } | null = null;

      setState(prev => {
        if (prev.isAnswered) return prev;

        const question = prev.questions[prev.currentIndex];
        const isCorrect = option === question.correctAnswer;
        answered = { wordId: question.wordId, isCorrect };

        if (!trackingRef.current?.skipLocalProgress) {
          progressRepository.recordAnswer(question.wordId, deckId, isCorrect);
        }
        if (sessionId) {
          sessionRepository.recordResult({
            sessionId,
            wordId: question.wordId,
            exerciseType: 'context',
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

      // Outside the updater: a re-invoked reducer must not double-count an
      // attempt.
      if (answered) {
        const { wordId, isCorrect } = answered;
        trackingRef.current?.onAnswer?.(wordId, { correct: isCorrect });
      }
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

  return { state, isLoading, sessionId, selectOption, next };
}
