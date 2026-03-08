import { useState, useCallback, useEffect, useRef } from 'react';
import { getNextWord, Word }      from '../db/words';
import { progressRepository }    from '../repositories/ProgressRepository';
import { sessionRepository }     from '../repositories/SessionRepository';
import { userRepository }        from '../repositories/UserRepository';
import { activityRepository }    from '../repositories/ActivityRepository';

export type SwipeDirection = 'left' | 'right';

export interface UseCardResult {
  word:      Word | null;
  isLoading: boolean;
  isEmpty:   boolean;
  isFlipped: boolean;
  sessionId: number | null;
  onSwipe:   (direction: SwipeDirection) => Promise<void>;
  onFlip:    () => void;
}

export function useCard(deckId: number): UseCardResult {
  const [word,      setWord]      = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmpty,   setIsEmpty]   = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const totalRef   = useRef(0);
  const correctRef = useRef(0);
  const shownAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      const sid   = await sessionRepository.create('quick', deckId);
      if (!cancelled) setSessionId(sid);

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
    })();

    return () => { cancelled = true; };
  }, [deckId]);

  const loadNext = useCallback(async (excludeId: number) => {
    const next = await getNextWord(deckId, excludeId);
    if (!next) {
      setIsEmpty(true);

      if (sessionId) {
        const xp = await sessionRepository.finish(sessionId, {
          totalWords:     totalRef.current,
          correctAnswers: correctRef.current,
          sessionType:    'quick',
        });
        await userRepository.addXP(xp);
        await activityRepository.recordWords(totalRef.current, xp);
        await userRepository.recordActivity();
      }
    } else {
      setWord(next);
      setIsFlipped(false);
      shownAtRef.current = Date.now();
    }
  }, [deckId, sessionId]);

  const onSwipe = useCallback(async (direction: SwipeDirection) => {
    if (!word || !sessionId) return;

    const isCorrect      = direction === 'right';
    const responseTimeMs = Date.now() - shownAtRef.current;

    const { xpEarned } = await progressRepository.recordAnswer(
      word.id,
      deckId,
      isCorrect,
    );

    await sessionRepository.recordResult({
      sessionId,
      wordId:       word.id,
      exerciseType: 'flashcard',
      isCorrect,
      responseTimeMs,
    });

    totalRef.current += 1;
    if (isCorrect) {
      correctRef.current += 1;
      if (xpEarned > 0) await userRepository.addXP(xpEarned);
    }

    await loadNext(word.id);
  }, [word, deckId, sessionId, loadNext]);

  const onFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  return { word, isLoading, isEmpty, isFlipped, sessionId, onSwipe, onFlip };
}
