import { useCallback } from 'react';
import { getMySubmissions, type MySubmissions } from '../api/submissions';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

export interface MySubmissionsState {
  status: 'loading' | 'loaded' | 'error';
  /** null: not loaded, failed with nothing cached, or refused — block 6 is not drawn. */
  submissions: MySubmissions | null;
  /** True while `submissions` is the cache — offline, the card says new reviews come later. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/** The learner's reviewed and waiting work, cached per user. Pick the card's row with `latestReviewed`. */
export function useMySubmissions(): MySubmissionsState {
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;
  const loader = useCallback(() => getMySubmissions(), []);
  const { status, data, stale, refresh } = useSwrResource<MySubmissions | null>(
    userId ? `submissions:${userId}` : null,
    loader,
  );
  return { status, submissions: data ?? null, stale, refresh };
}
