import { useMemo } from 'react';
import type { VocabularyListReaderContent } from '../api/vocabulary';
import { vocabularyListResource } from '../lib/courseResources';
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
  const resource = useMemo(
    () => vocabularyListResource(listId, uiLanguage),
    [listId, uiLanguage],
  );
  const { status, data, error, refreshing, stale, refresh } =
    useSwrResource<VocabularyListReaderContent>(resource.key, resource.load);

  return { status, data, error, refreshing, stale, refresh };
}
