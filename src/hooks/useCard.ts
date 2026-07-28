import { useState, useCallback, useEffect, useRef } from 'react';
import { getNextWord, Word } from '../db/words';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';
import { userRepository } from '../repositories/UserRepository';
import { activityRepository } from '../repositories/ActivityRepository';
import { DeepSessionWord } from './useDeepSession';
import type { ExerciseTracking } from './exerciseTracking';

export type SwipeDirection = 'left' | 'right';
export type FlashcardMode = 'assessment' | 'review';

export interface UseCardResult {
  word: Word | null;
  isLoading: boolean;
  isEmpty: boolean;
  isFlipped: boolean;
  sessionId: number | null;
  onSwipe: (direction: SwipeDirection) => Promise<void>;
  onFlip: () => void;
}

// Convert DeepSessionWord to Word shape for FlipCard compatibility
function toWord(dsw: DeepSessionWord): Word {
  return {
    id: dsw.wordId,
    word: dsw.word,
    translation: dsw.translation,
    status: 'new',
    partOfSpeech: null,
    gender: null,
    level: null,
    ordbokenUrl: null,
    imageUrl: null,
    forms: [],
  } as unknown as Word;
}

export function useCard(
  deckId: number,
  mode: FlashcardMode = 'assessment',
  overrideWords?: DeepSessionWord[],
  onDeepDone?: (weakIds: number[], correctCount: number) => void,
  tracking?: ExerciseTracking,
): UseCardResult {
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const totalRef = useRef(0);
  const correctRef = useRef(0);
  const shownAtRef = useRef<number>(Date.now());
  const weakIdsRef = useRef<Set<number>>(new Set());
  const queueRef = useRef<DeepSessionWord[]>([]);
  const isDeepMode = !!overrideWords;
  // Read through a ref so a caller passing an inline object does not need to
  // memoize it just to keep onSwipe stable.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      // In review mode — no session needed
      const sid =
        mode === 'assessment'
          ? await sessionRepository.create(
              isDeepMode ? 'deep' : 'quick',
              deckId,
            )
          : null;

      if (!cancelled) setSessionId(sid);

      if (isDeepMode && overrideWords) {
        // Deep mode — use provided words as queue
        queueRef.current = [...overrideWords].sort(() => Math.random() - 0.5);
        const first = queueRef.current.shift();
        if (!cancelled) {
          if (!first) {
            setIsEmpty(true);
          } else {
            setWord(toWord(first));
            shownAtRef.current = Date.now();
          }
          setIsLoading(false);
        }
      } else {
        // Normal mode — load from DB
        const first = await getNextWord(deckId, null);
        if (!cancelled) {
          if (!first) {
            setIsEmpty(true);
          } else {
            setWord(first);
            shownAtRef.current = Date.now();
          }
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const finishSession = useCallback(
    async (sid: number) => {
      // In review mode — no session to finish
      if (mode !== 'assessment') return;

      const xp = await sessionRepository.finish(sid, {
        totalWords: totalRef.current,
        correctAnswers: correctRef.current,
        sessionType: isDeepMode ? 'deep' : 'quick',
      });
      await userRepository.addXP(xp);
      await activityRepository.recordWords(totalRef.current, xp);
      await userRepository.recordActivity();
    },
    [mode, isDeepMode],
  );

  const loadNext = useCallback(
    async (currentWordId: number) => {
      if (isDeepMode) {
        const next = queueRef.current.shift();
        if (!next) {
          setIsEmpty(true);
          if (sessionId) await finishSession(sessionId);
          onDeepDone?.(Array.from(weakIdsRef.current), correctRef.current);
        } else {
          setWord(toWord(next));
          setIsFlipped(false);
          shownAtRef.current = Date.now();
        }
      } else {
        const next = await getNextWord(deckId, currentWordId);
        if (!next) {
          setIsEmpty(true);
          if (sessionId) await finishSession(sessionId);
        } else {
          setWord(next);
          setIsFlipped(false);
          shownAtRef.current = Date.now();
        }
      }
    },
    [deckId, sessionId, isDeepMode, finishSession, onDeepDone],
  );

  const onSwipe = useCallback(
    async (direction: SwipeDirection) => {
      if (!word) return;

      const isCorrect = direction === 'right';
      const responseTimeMs = Date.now() - shownAtRef.current;

      if (mode === 'assessment') {
        // assessment mode — record progress and session results
        //
        // The swipe is self-report, not a recall test (`isCorrect` is just the
        // direction), so `sessionGrader` refuses to score it alongside measured
        // modes. `gradePersonalWord` accepts it on its own and caps it at GOOD,
        // which is what keeps this screen able to schedule anything at all.
        const { xpEarned } = trackingRef.current?.skipLocalProgress
          ? { xpEarned: 0 }
          : await progressRepository.recordAnswer(word.id, deckId, isCorrect);

        trackingRef.current?.onAnswer?.(word.id, { correct: isCorrect });

        if (sessionId) {
          await sessionRepository.recordResult({
            sessionId,
            wordId: word.id,
            exerciseType: 'flashcard',
            isCorrect,
            responseTimeMs,
          });
        }

        totalRef.current += 1;
        if (isCorrect) {
          correctRef.current += 1;
          if (xpEarned > 0) await userRepository.addXP(xpEarned);
        } else {
          weakIdsRef.current.add(word.id);
        }
      } else {
        // review mode — only track locally, no DB writes
        totalRef.current += 1;
        if (isCorrect) {
          correctRef.current += 1;
        } else {
          weakIdsRef.current.add(word.id);
        }
      }

      await loadNext(word.id);
    },
    [word, deckId, sessionId, mode, loadNext],
  );

  const onFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  return { word, isLoading, isEmpty, isFlipped, sessionId, onSwipe, onFlip };
}
