import { useState, useCallback, useEffect, useRef } from 'react';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import { spellingRepository } from '../repositories/SpellingRepository';
import { wordModeStrengthRepository } from '../repositories/WordModeStrengthRepository';
import { settingsStore, SpellingHintMode } from '../store/settingsStore';
import type { ExerciseTracking } from './exerciseTracking';
import type { AttemptResult } from '../lib/sessionGrader';

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
  mistakeCount: number;
  showHint: boolean;
  showSkip: boolean;
  isComplete: boolean;
  totalWords: number;
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

const MISTAKES_BEFORE_HINT = 2;
const MISTAKES_BEFORE_SKIP = 3;
const SKIP_PENALTY_MISTAKES = 3;

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function resolveInitialHint(): boolean {
  const spellingHintMode = settingsStore.get(
    'spellingHintMode',
  ) as SpellingHintMode;
  return spellingHintMode === 'always';
}

export function useSpelling(
  deckId: number,
  overrideWordIds?: number[],
  onComplete?: (correctCount: number) => void,
  tracking?: ExerciseTracking,
): UseSpellingResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  // Mutable queue — wrong answers get appended to end, no re-render on mutation
  const queueRef = useRef<SpellingQuestion[]>([]);
  const shownAtRef = useRef<number>(Date.now());
  // Read through a ref so an inline tracking object does not destabilise
  // submit/skip.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;

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
    totalWords: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, questions] = await Promise.all([
        sessionRepository.create('quick', deckId),
        spellingRepository.getQuestionsForDeck(deckId, 'ru', overrideWordIds),
      ]);
      if (!cancelled) {
        queueRef.current = [...questions];
        setSessionId(sid);
        setState(prev => ({
          ...prev,
          questions,
          totalWords: questions.length,
          showHint: resolveInitialHint(),
        }));
        shownAtRef.current = Date.now();
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, JSON.stringify(overrideWordIds)]);

  const setInput = useCallback((value: string) => {
    setState(prev => {
      if (prev.isAnswered || prev.isSkipped) return prev;
      return { ...prev, input: value };
    });
  }, []);

  const submit = useCallback(() => {
    let answered: { wordId: number; result: AttemptResult } | null = null;

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

      const showSkip = newMistakeCount >= MISTAKES_BEFORE_SKIP;

      // Only an *earned* hint counts as help: under `always` the hint is on
      // screen for every word, so it carries no information about this word and
      // would otherwise cap every course card at HARD forever (decided with the
      // user, 2026-07-27). Mistakes still drive the grading in that mode.
      answered = {
        wordId: question.wordId,
        result: {
          correct: isCorrect,
          hintUsed: spellingHintMode === 'after_mistake' && prev.showHint,
        },
      };

      if (!trackingRef.current?.skipLocalProgress) {
        progressRepository.recordAnswer(question.wordId, deckId, isCorrect);
      }
      wordModeStrengthRepository.recordAnswer(
        question.wordId,
        deckId,
        'spelling',
        isCorrect,
      );

      if (sessionId) {
        sessionRepository.recordResult({
          sessionId,
          wordId: question.wordId,
          exerciseType: 'spelling',
          isCorrect,
          responseTimeMs,
        });
      }

      // If wrong — push to end of queue for retry
      if (!isCorrect) {
        queueRef.current.push(question);
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

      return {
        ...prev,
        input: '',
        isCorrect: false,
        mistakeCount: newMistakeCount,
        showHint,
        showSkip,
      };
    });

    // Outside the updater — a re-invoked reducer must not double-count.
    if (answered) {
      const { wordId, result } = answered;
      trackingRef.current?.onAnswer?.(wordId, result);
    }
  }, [deckId, sessionId]);

  const skip = useCallback(() => {
    let skipped: number | null = null;

    setState(prev => {
      if (prev.isAnswered || prev.isSkipped) return prev;

      const question = prev.questions[prev.currentIndex];
      skipped = question.wordId;

      for (let i = 0; i < SKIP_PENALTY_MISTAKES; i++) {
        if (!trackingRef.current?.skipLocalProgress) {
          progressRepository.recordAnswer(question.wordId, deckId, false);
        }
        wordModeStrengthRepository.recordAnswer(
          question.wordId,
          deckId,
          'spelling',
          false,
        );
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
        showHint: true,
      };
    });

    // One attempt, not three: the local engine takes a triple penalty, but for
    // grading this is a single event — the user gave up on this word.
    if (skipped !== null) {
      trackingRef.current?.onAnswer?.(skipped, { correct: false, gaveUp: true });
    }
  }, [deckId, sessionId]);

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
        shouldComplete = true;
        finalCorrectCount = prev.correctCount;
      }

      shownAtRef.current = Date.now();

      const spellingHintMode = settingsStore.get(
        'spellingHintMode',
      ) as SpellingHintMode;

      return {
        ...prev,
        questions: isComplete ? prev.questions : queueRef.current,
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

    // Call onComplete outside setState to avoid side effect in reducer
    if (shouldComplete) {
      onComplete?.(finalCorrectCount);
    }
  }, [sessionId, onComplete]);

  return { state, isLoading, sessionId, setInput, submit, skip, next };
}
