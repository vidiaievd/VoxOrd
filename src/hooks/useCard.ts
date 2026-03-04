import { useState, useCallback } from 'react';
import { getNextWord, updateWordStatus, Word, WordStatus } from '../db/words';

interface UseCardResult {
  word: Word | null;
  isLoading: boolean;
  isEmpty: boolean;
  onSwipe: (status: WordStatus) => Promise<void>;
  onFlip: () => Promise<void>;
}

export function useCard(): UseCardResult {
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadNext = useCallback(async (excludeId?: number) => {
    setIsLoading(true);
    const next = await getNextWord(excludeId);
    if (!next) {
      setIsEmpty(true);
    } else {
      setWord(next);
      setIsEmpty(false);
    }
    setIsLoading(false);
  }, []);

  const initialize = useCallback(() => {
    if (!isInitialized) {
      setIsInitialized(true);
      loadNext();
    }
  }, [isInitialized, loadNext]);

  const onFlip = useCallback(async () => {
    if (!word || word.status !== 'new') return;
    await updateWordStatus(word.id, 'repeat');
    setWord(prev => prev ? { ...prev, status: 'repeat' } : prev);
  }, [word]);

  const onSwipe = useCallback(async (status: WordStatus) => {
    if (!word) return;
    await updateWordStatus(word.id, status);
    await loadNext(word.id);
  }, [word, loadNext]);

  useState(() => { initialize(); });

  return { word, isLoading, isEmpty, onSwipe, onFlip };
}