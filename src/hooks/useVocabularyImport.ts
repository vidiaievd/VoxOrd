import { useCallback, useEffect, useRef, useState } from 'react';
import { getVocabularyList, type VocabularyListReaderContent } from '../api/vocabulary';
import { buildImportPlan } from '../repositories/vocabularyImportMapping';
import {
  vocabularyImportRepository,
  type ImportResult,
} from '../repositories/VocabularyImportRepository';
import { useSettings } from './useSettings';

export interface VocabularyImportState {
  /** Null until the local lookup finishes; true when this list is already a deck. */
  alreadyImported: boolean | null;
  status: 'idle' | 'running' | 'done' | 'error';
  result: ImportResult | null;
  error: Error | null;
  run: (reader: VocabularyListReaderContent, coursesGroupTitle: string) => Promise<void>;
}

/**
 * Drives "Save to VoxOrd deck". The reader content the screen already loaded is
 * passed in rather than re-fetched; only the list metadata (target language,
 * CEFR level — absent from the reader payload) is fetched here.
 */
export function useVocabularyImport(listId: string): VocabularyImportState {
  const { uiLanguage } = useSettings();
  const [alreadyImported, setAlreadyImported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    vocabularyImportRepository
      .findDeckIdForList(listId)
      .then(deckId => {
        if (!cancelled) setAlreadyImported(deckId !== null);
      })
      .catch(() => {
        if (!cancelled) setAlreadyImported(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const run = useCallback(
    async (reader: VocabularyListReaderContent, coursesGroupTitle: string) => {
      setStatus('running');
      setError(null);
      try {
        const list = await getVocabularyList(listId);
        const plan = buildImportPlan(list, reader, uiLanguage);
        const importResult = await vocabularyImportRepository.importList(plan, {
          coursesGroupTitle,
        });
        if (!mounted.current) return;
        setResult(importResult);
        setAlreadyImported(true);
        setStatus('done');
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
      }
    },
    [listId, uiLanguage],
  );

  return { alreadyImported, status, result, error, run };
}
