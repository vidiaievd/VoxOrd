import { useCallback } from 'react';
import {
  getVocabularyListReader,
  type VocabularyListReaderContent,
} from '../api/vocabulary';
import { useSettings } from './useSettings';
import { useSwrResource } from './useSwrResource';

export interface VocabularyListState {
  status: 'loading' | 'loaded' | 'error';
  data: VocabularyListReaderContent | null;
  error: Error | null;
  refreshing: boolean;
  /** True while `data` is a cached value shown ahead of (or instead of, on failure) a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads a course vocabulary list for reading. The app's UI language doubles as
 * the student's translation language — the same stand-in `useLessonReader`
 * uses, since mobile has no profile-service dependency yet. The server picks a
 * fallback language on its own when the requested one is missing and flags it
 * via `fallbackUsed` / `immersionMode`.
 *
 * Stale-while-revalidate (Phase 6 open item): the reader DTO carries no
 * version/updatedAt field (checked against source), so cached content is keyed
 * on (listId, uiLanguage) alone and always revalidated in the background,
 * mirroring the course-home cache's same limitation.
 */
export function useVocabularyList(listId: string): VocabularyListState {
  const { uiLanguage } = useSettings();
  const loader = useCallback(
    () =>
      getVocabularyListReader(listId, {
        translationLanguage: uiLanguage,
        includeExamples: true,
        examplesLimit: 3,
      }),
    [listId, uiLanguage],
  );

  const { status, data, error, refreshing, stale, refresh } =
    useSwrResource<VocabularyListReaderContent>(
      `vocab-reader:${listId}:${uiLanguage}`,
      loader,
    );

  return { status, data, error, refreshing, stale, refresh };
}
