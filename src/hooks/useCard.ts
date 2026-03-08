import { useState, useCallback, useEffect } from 'react';
import { wordRepository } from '../repositories/WordRepository';
import { Word, WordStatus } from '../db/words';

interface UseCardResult {
  word: Word | null;
  isLoading: boolean;
  isEmpty: boolean;
  onSwipe: (status: WordStatus) => Promise<void>;
  onFlip: () => Promise<void>;
}

export function useCard(deckId: number): UseCardResult {
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);

  const loadNext = useCallback(
    async (excludeId?: number) => {
      setIsLoading(true);
      const next = await wordRepository.getNext(deckId, excludeId);
      if (!next) {
        setIsEmpty(true);
        setWord(null);
      } else {
        setWord(next);
        setIsEmpty(false);
      }
      setIsLoading(false);
    },
    [deckId],
  );

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const onFlip = useCallback(async () => {
    if (!word) return;
    const updated = await wordRepository.markAsSeen(word);
    setWord(updated);
  }, [word]);

  const onSwipe = useCallback(
    async (status: WordStatus) => {
      if (!word) return;
      await wordRepository.applySwipeResult(word, status);
      await loadNext(word.id);
    },
    [word, loadNext],
  );

  return { word, isLoading, isEmpty, onSwipe, onFlip };
}
