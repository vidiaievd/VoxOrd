import { useCallback } from 'react';
import { getMyHistory, type HistoryItem } from '../api/courses';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

/** Finished courses for the «History» section; cached per user like `useMyCourses`. */
export function useMyHistory(): { items: HistoryItem[]; refresh: () => Promise<void> } {
  const { status: authStatus, user } = useAuth();
  const loader = useCallback(getMyHistory, []);
  const { data, refresh } = useSwrResource<HistoryItem[]>(
    authStatus === 'signedIn' && user ? `history:${user.id}` : null,
    loader,
  );
  return { items: data ?? [], refresh };
}
