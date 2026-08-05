import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getVocabularyListReader,
  type VocabularyListReaderContent,
} from '../api/vocabulary';
import { useSettings } from './useSettings';

export interface VocabularyListState {
  status: 'loading' | 'loaded' | 'error';
  data: VocabularyListReaderContent | null;
  error: Error | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads a course vocabulary list for reading. The app's UI language doubles as
 * the student's translation language — the same stand-in `useLessonReader`
 * uses, since mobile has no profile-service dependency yet. The server picks a
 * fallback language on its own when the requested one is missing and flags it
 * via `fallbackUsed` / `immersionMode`.
 */
export function useVocabularyList(listId: string): VocabularyListState {
  const { uiLanguage } = useSettings();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<VocabularyListReaderContent | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setStatus('loading');
      }
      try {
        const content = await getVocabularyListReader(listId, {
          translationLanguage: uiLanguage,
          includeExamples: true,
          examplesLimit: 3,
        });
        if (!mounted.current) return;
        setData(content);
        setStatus('loaded');
        setError(null);
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [listId, uiLanguage],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { status, data, error, refreshing, refresh };
}
