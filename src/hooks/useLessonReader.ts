import { useMemo } from 'react';
import { lessonReaderResource, type LessonReaderData } from '../lib/courseResources';
import { useUiLanguage } from '../i18n';
import { useSwrResource } from './useSwrResource';

export type { LessonReaderData };

export interface LessonReaderState {
  status: 'loading' | 'loaded' | 'error';
  data: LessonReaderData | null;
  error: Error | null;
  /** True while `data` is a cached value shown ahead of (or instead of, on failure) a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Resolves the course's CEFR level (from its container) alongside the app's
 * UI language as the student's native language, then fetches the reader
 * content for that (lesson, level, language) combination — mirrors what the
 * web reader gets from a student profile, without adding a profile-service
 * dependency mobile doesn't have yet.
 *
 * Stale-while-revalidate (Phase 6 open item): cached content is near-immutable
 * — content-service's reader DTO carries no version/updatedAt field (checked
 * against source), so there is no server-supplied signal to key on beyond
 * (lessonId, courseId, uiLanguage); this mirrors the course-home cache, which
 * has the same limitation and always revalidates in the background rather
 * than trusting a TTL.
 */
export function useLessonReader(lessonId: string, courseId: string): LessonReaderState {
  const uiLanguage = useUiLanguage();
  const resource = useMemo(
    () => lessonReaderResource(lessonId, courseId, uiLanguage),
    [lessonId, courseId, uiLanguage],
  );
  const { status, data, error, stale, refresh } = useSwrResource<LessonReaderData>(
    resource.key,
    resource.load,
  );

  return { status, data, error, stale, refresh };
}
