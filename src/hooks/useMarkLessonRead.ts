import { useCallback, useRef, useState } from 'react';
import { buildLessonCompletionRequest, upsertProgress } from '../api/progress';
import { isServerOutOfReach } from '../api/isNetworkError';
import { exerciseOutboxStore } from '../store/exerciseOutboxStore';

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
    const request = buildLessonCompletionRequest(lessonId, startedAtRef.current);
    try {
      await upsertProgress(request);
      setStatus('idle');
      return true;
    } catch (e) {
      if (isServerOutOfReach(e)) {
        // Read offline: the mark goes out with the connection (offline plan, B4), and the
        // reader moves on as if it had already.
        await exerciseOutboxStore.enqueueProgress(request);
        setStatus('idle');
        return true;
      }
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
      return false;
    }
  }, [lessonId]);

  return { status, error, markAsRead };
}
