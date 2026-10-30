import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVocabularyList, formatTranslation, type VocabularyItemDisplay } from '../api/vocabulary';
import { deleteMyWord, listMyWords, type PersonalWord } from '../api/personalVocabulary';
import { wordCaptureQueueStore } from '../store/wordCaptureQueueStore';
import { removeMyWord, syncMyWords } from '../lib/myWordsSync';
import { useUiLanguage } from '../i18n';

/** A word of the list that is in «My words»; `null` while its server entry is not known (added offline). */
type Entries = Map<string, PersonalWord | null>;

export interface ListMyWords {
  /** The language of the list's words; null until the list's metadata arrives. */
  targetLanguage: string | null;
  isMine: (item: VocabularyItemDisplay) => boolean;
  mineCount: number;
  /** Adds or removes one word, showing the result at once; a refused add is taken back. */
  toggle: (item: VocabularyItemDisplay) => void;
  /** Adds every word that is not in yet. */
  addAll: () => Promise<void>;
}

/**
 * Which words of a course list are in the student's «My words» (Courses §8.4), and the
 * bookmark that moves them. A course word's entry is looked up by its item id; one added
 * with no connection waits in the capture queue and shows as added meanwhile.
 *
 * Without a connection the first lookup fails and the bookmarks start empty — except for
 * the student's own words, which the list already marks.
 */
export function useListMyWords(
  listId: string,
  items: readonly VocabularyItemDisplay[],
): ListMyWords {
  const uiLanguage = useUiLanguage();
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entries>(new Map());
  // Own words the student took out in this visit — they are still marked `personal` in the list.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getVocabularyList(listId)
      .then(list => !cancelled && setTargetLanguage(list.targetLanguage))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listId]);

  useEffect(() => {
    if (!targetLanguage) return;
    let cancelled = false;
    listMyWords({ translationLanguage: uiLanguage, targetLanguage })
      .then(words => {
        if (cancelled) return;
        const mine = new Set(items.map(i => i.itemId));
        setEntries(prev => {
          const next: Entries = new Map(prev);
          for (const word of words) {
            if (mine.has(word.vocabularyItemId)) next.set(word.vocabularyItemId, word);
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [targetLanguage, uiLanguage, items]);

  const isMine = useCallback(
    (item: VocabularyItemDisplay) =>
      entries.has(item.itemId) || (item.personal === true && !removed.has(item.itemId)),
    [entries, removed],
  );

  const mineCount = useMemo(() => items.filter(isMine).length, [items, isMine]);

  /** Captures one word; true when it is saved or kept for later, false when the server refused it. */
  const capture = useCallback(
    async (item: VocabularyItemDisplay): Promise<boolean> => {
      if (!targetLanguage) return false;
      const translation = formatTranslation(item);
      const outcome = await wordCaptureQueueStore.submit({
        targetLanguage,
        translationLanguage: uiLanguage,
        surfaceForm: item.word,
        ...(translation ? { translation } : {}),
      });
      if (outcome.kind === 'refused') return false;
      if (!mounted.current) return true;
      setEntries(prev =>
        new Map(prev).set(item.itemId, outcome.kind === 'saved' ? outcome.response.word : null),
      );
      setRemoved(prev => {
        if (!prev.has(item.itemId)) return prev;
        const next = new Set(prev);
        next.delete(item.itemId);
        return next;
      });
      return true;
    },
    [targetLanguage, uiLanguage],
  );

  const toggle = useCallback(
    (item: VocabularyItemDisplay) => {
      if (!targetLanguage) return;
      const entry = entries.get(item.itemId);

      if (!isMine(item)) {
        // Optimistic: the bookmark fills now and is emptied again if the server says no.
        setEntries(prev => new Map(prev).set(item.itemId, null));
        capture(item)
          .then(ok => {
            if (ok) {
              syncMyWords(uiLanguage).catch(() => undefined);
              return;
            }
            if (!mounted.current) return;
            setEntries(prev => {
              const next = new Map(prev);
              next.delete(item.itemId);
              return next;
            });
          })
          .catch(() => undefined);
        return;
      }

      // Taken out. A word added offline has no entry to delete until the queue delivers it.
      if (entry === null) return;
      const before = entries;
      setEntries(prev => {
        const next = new Map(prev);
        next.delete(item.itemId);
        return next;
      });
      setRemoved(prev => new Set(prev).add(item.itemId));
      if (!entry) return;
      removeMyWord(entry, () => deleteMyWord(entry.entryId)).catch(() => {
        if (mounted.current) setEntries(before);
      });
    },
    [targetLanguage, entries, isMine, capture, uiLanguage],
  );

  const addAll = useCallback(async () => {
    if (!targetLanguage) return;
    for (const item of items) {
      if (!isMine(item)) await capture(item);
    }
    syncMyWords(uiLanguage).catch(() => undefined);
  }, [targetLanguage, items, isMine, capture, uiLanguage]);

  return { targetLanguage, isMine, mineCount, toggle, addAll };
}
