import { useState, useCallback, useEffect, useRef } from 'react';
import { sessionRepository } from '../repositories/SessionRepository';
import { spellingRepository } from '../repositories/SpellingRepository';
import { wordModeStrengthRepository } from '../repositories/WordModeStrengthRepository';
import { settingsStore, SpellingHintMode } from '../store/settingsStore';
import type { ExerciseTracking } from './exerciseTracking';
import { wordSetKey } from './wordSetKey';
import type { AttemptResult } from '../lib/sessionGrader';
import { classifyAnswer } from '../lib/answerMatching';

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
  /** The full correct word is on screen (after two mistakes). */
  isRevealed: boolean;
  /** The last answer was accepted as a near-miss, not an exact match. */
  wasTypo: boolean;
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
/**
 * After this many mistakes the full word is shown. Previously the only way to
 * ever see it was pressing skip, which itself needed three mistakes — so a word
 * you could not guess was a dead end.
 */
const MISTAKES_BEFORE_REVEAL = 2;

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
  // Unlike quiz/listening (one attempt per presentation, then locked until
  // `next`), spelling lets the user keep retrying the same question without
  // advancing — "Try again" and "Next" are both available on a wrong answer.
  // Without this flag, every one of those retries would push another copy of
  // the word onto the retry queue, so a handful of mistyped attempts on one
  // word could demand it be typed correctly several more times later in the
  // session. One requeue per presentation, no matter how many wrong attempts.
  const requeuedThisPresentationRef = useRef(false);
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
    isRevealed: false,
    wasTypo: false,
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
        requeuedThisPresentationRef.current = false;
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
  }, [deckId, wordSetKey(overrideWordIds)]);

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
      // A near-miss is accepted so a slipped keystroke is not read as "did not
      // know the word", but it is reported as a typo so the grader can hold it
      // to HARD instead of a clean success.
      const verdict = classifyAnswer(prev.input, question.word);
      const isCorrect = verdict !== 'wrong';
      const isTypo = verdict === 'typo';
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
          typo: isTypo,
        },
      };

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

      // If wrong — push to end of queue for retry, but only once per
      // presentation (see the ref's comment above).
      if (!isCorrect && !requeuedThisPresentationRef.current) {
        queueRef.current.push(question);
        requeuedThisPresentationRef.current = true;
      }

      if (isCorrect) {
        return {
          ...prev,
          isAnswered: true,
          isCorrect: true,
          wasTypo: isTypo,
          // A typo still shows the correct form, so the right spelling is seen.
          isRevealed: prev.isRevealed || isTypo,
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
        wasTypo: false,
        isRevealed: prev.isRevealed || newMistakeCount >= MISTAKES_BEFORE_REVEAL,
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
        isRevealed: true,
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
      requeuedThisPresentationRef.current = false;

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
        isRevealed: false,
        wasTypo: false,
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
