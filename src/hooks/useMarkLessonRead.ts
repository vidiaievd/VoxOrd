import { useCallback, useRef, useState } from 'react';
import { buildLessonCompletionRequest, upsertProgress } from '../api/progress';

export interface MarkLessonReadState {
  status: 'idle' | 'submitting' | 'error';
  error: Error | null;
  markAsRead: () => Promise<boolean>;
}

/** Timer starts once per mount, mirroring the web reader's per-item timer. */
export function useMarkLessonRead(lessonId: string): MarkLessonReadState {
  const startedAtRef = useRef(Date.now());
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);

  const markAsRead = useCallback(async (): Promise<boolean> => {
    setStatus('submitting');
    setError(null);
    try {
      await upsertProgress(buildLessonCompletionRequest(lessonId, startedAtRef.current));
      setStatus('idle');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
      return false;
    }
  }, [lessonId]);

  return { status, error, markAsRead };
}
