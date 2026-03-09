import { useState, useCallback, useEffect, useRef } from 'react';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import { settingsStore, SpellingHintMode } from '../store/settingsStore';

export interface SpellingQuestion {
  wordId: number;
  word: string;
  translation: string;
  hint: string;
}

export interface SpellingState {
  questions: SpellingQuestion[];
  currentIndex: number;
  input: string;
  isAnswered: boolean;
  isCorrect: boolean | null;
  isSkipped: boolean;
  correctCount: number;
  skippedCount: number;
  mistakeCount: number; // mistakes on current question
  showHint: boolean;
  showSkip: boolean;
  isComplete: boolean;
}

export interface UseSpellingResult {
  state: SpellingState;
  isLoading: boolean;
  sessionId: number | null;
  setInput: (value: string) => void;
  submit: () => void;
  skip: () => void;
  next: () => void;
}

const QUESTION_COUNT = 7;
const MISTAKES_BEFORE_HINT = 2;
const MISTAKES_BEFORE_SKIP = 3;

// Penalty multiplier applied to spaced repetition after skip
const SKIP_PENALTY_MISTAKES = 3;

function buildHint(word: string): string {
  return word
    .split('')
    .map((char, index) => {
      if (index === 0) return char;
      if (char === ' ') return ' ';
      return '_';
    })
    .join('');
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function resolveInitialHint(): boolean {
  const spellingHintMode = settingsStore.get(
    'spellingHintMode',
  ) as SpellingHintMode;
  return spellingHintMode === 'always';
}

async function loadQuestions(
  deckId: number,
  uiLang: string = 'ru',
): Promise<SpellingQuestion[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT
       w.id     AS wordId,
       w.word,
       t.translation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
     ORDER BY RANDOM()
     LIMIT ?;`,
    [deckId, uiLang, QUESTION_COUNT],
  );

  return (result.rows ?? []).map(row => ({
    wordId: row.wordId as number,
    word: row.word as string,
    translation: row.translation as string,
    hint: buildHint(row.word as string),
  }));
}

export function useSpelling(deckId: number): UseSpellingResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<SpellingState>({
    questions: [],
    currentIndex: 0,
    input: '',
    isAnswered: false,
    isCorrect: null,
    isSkipped: false,
    correctCount: 0,
    skippedCount: 0,
    mistakeCount: 0,
    showHint: resolveInitialHint(),
    showSkip: false,
    isComplete: false,
  });

  const shownAtRef = useRef<number>(Date.now());

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
        setState(prev => ({
          ...prev,
          questions,
          showHint: resolveInitialHint(),
        }));
        shownAtRef.current = Date.now();
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const setInput = useCallback((value: string) => {
    setState(prev => {
      if (prev.isAnswered || prev.isSkipped) return prev;
      return { ...prev, input: value };
    });
  }, []);

  const submit = useCallback(() => {
    setState(prev => {
      if (prev.isAnswered || prev.isSkipped || prev.input.trim() === '') {
        return prev;
      }

      const question = prev.questions[prev.currentIndex];
      const isCorrect =
        normalizeAnswer(prev.input) === normalizeAnswer(question.word);
      const responseTimeMs = Date.now() - shownAtRef.current;
      const newMistakeCount = isCorrect
        ? prev.mistakeCount
        : prev.mistakeCount + 1;

      const spellingHintMode = settingsStore.get(
        'spellingHintMode',
      ) as SpellingHintMode;
      const showHint =
        spellingHintMode === 'always' ||
        (spellingHintMode === 'after_mistake' &&
          newMistakeCount >= MISTAKES_BEFORE_HINT);

      // Show skip button after N mistakes
      const showSkip = newMistakeCount >= MISTAKES_BEFORE_SKIP;

      // Fire and forget
      progressRepository.recordAnswer(question.wordId, deckId, isCorrect);
      if (sessionId) {
        sessionRepository.recordResult({
          sessionId,
          wordId: question.wordId,
          exerciseType: 'spelling',
          isCorrect,
          responseTimeMs,
        });
      }

      if (isCorrect) {
        return {
          ...prev,
          isAnswered: true,
          isCorrect: true,
          correctCount: prev.correctCount + 1,
          mistakeCount: newMistakeCount,
          showHint,
          showSkip,
        };
      }

      // Wrong — clear input, stay on question
      return {
        ...prev,
        input: '',
        isCorrect: false,
        mistakeCount: newMistakeCount,
        showHint,
        showSkip,
      };
    });
  }, [deckId, sessionId]);

  const skip = useCallback(() => {
    setState(prev => {
      if (prev.isAnswered || prev.isSkipped) return prev;

      const question = prev.questions[prev.currentIndex];

      // Apply skip penalty — record multiple wrong answers to push
      // the word back to an earlier memory stage
      for (let i = 0; i < SKIP_PENALTY_MISTAKES; i++) {
        progressRepository.recordAnswer(question.wordId, deckId, false);
      }
      if (sessionId) {
        sessionRepository.recordResult({
          sessionId,
          wordId: question.wordId,
          exerciseType: 'spelling',
          isCorrect: false,
          responseTimeMs: Date.now() - shownAtRef.current,
        });
      }

      return {
        ...prev,
        input: '',
        isSkipped: true,
        skippedCount: prev.skippedCount + 1,
        showHint: true, // always show hint after skip
      };
    });
  }, [deckId, sessionId]);

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

      shownAtRef.current = Date.now();

      const spellingHintMode = settingsStore.get(
        'spellingHintMode',
      ) as SpellingHintMode;

      return {
        ...prev,
        currentIndex: nextIndex,
        input: '',
        isAnswered: false,
        isCorrect: null,
        isSkipped: false,
        mistakeCount: 0,
        showHint: spellingHintMode === 'always',
        showSkip: false,
        isComplete,
      };
    });
  }, [sessionId]);

  return { state, isLoading, sessionId, setInput, submit, skip, next };
}
