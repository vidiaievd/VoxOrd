import { useCallback, useEffect, useRef, useState } from 'react';
import { getContainer } from '../api/courses';
import { getLessonReaderContent, LessonReaderContent } from '../api/lessons';
import { useSettings } from './useSettings';

export interface LessonReaderState {
  status: 'loading' | 'loaded' | 'error';
  data: LessonReaderContent | null;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Resolves the course's CEFR level (from its container) alongside the app's
 * UI language as the student's native language, then fetches the reader
 * content for that (lesson, level, language) combination — mirrors what the
 * web reader gets from a student profile, without adding a profile-service
 * dependency mobile doesn't have yet.
 */
export function useLessonReader(lessonId: string, courseId: string): LessonReaderState {
  const { uiLanguage } = useSettings();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<LessonReaderContent | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const container = await getContainer(courseId);
      const content = await getLessonReaderContent(lessonId, {
        studentNativeLanguage: uiLanguage,
        studentCurrentLevel: container.difficultyLevel,
      });
      if (!mounted.current) return;
      setData(content);
      setStatus('loaded');
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
    }
  }, [lessonId, courseId, uiLanguage]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, data, error, refresh: load };
}
