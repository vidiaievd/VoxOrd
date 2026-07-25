import { useCallback } from 'react';
import { getContainer } from '../api/courses';
import { getLessonReaderContent, LessonReaderContent } from '../api/lessons';
import { useSettings } from './useSettings';
import { useSwrResource } from './useSwrResource';

export interface LessonReaderState {
  status: 'loading' | 'loaded' | 'error';
  data: LessonReaderContent | null;
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
  const { uiLanguage } = useSettings();
  const loader = useCallback(async () => {
    const container = await getContainer(courseId);
    return getLessonReaderContent(lessonId, {
      studentNativeLanguage: uiLanguage,
      studentCurrentLevel: container.difficultyLevel,
    });
  }, [lessonId, courseId, uiLanguage]);

  const { status, data, error, stale, refresh } = useSwrResource<LessonReaderContent>(
    `lesson-reader:${lessonId}:${courseId}:${uiLanguage}`,
    loader,
  );

  return { status, data, error, stale, refresh };
}
