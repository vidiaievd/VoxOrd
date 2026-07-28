import { useState, useEffect, useCallback } from 'react';
import { homeRepository, HomeScreenData } from '../repositories/HomeRepository';
import { useAuth } from './useAuth';

interface UseHomeDataResult {
  data: HomeScreenData | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Waits out `authStore`'s 'restoring' status before loading. Without this,
 * a cold start reads `getHomeData()` while the stored session is still being
 * restored, `HomeRepository.getCourseDueCount()` sees a status that isn't
 * 'signedIn' yet, and the course-due row silently disappears from Home for
 * the rest of that session — no error, no warning, just a wrong 0. Reloading
 * on every status change also picks it back up after a genuine sign-in.
 */
export function useHomeData(): UseHomeDataResult {
  const [data, setData] = useState<HomeScreenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { status } = useAuth();

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await homeRepository.getHomeData();
    setData(result);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (status === 'restoring') return;
    load();
  }, [status, load]);

  return { data, isLoading, refresh: load };
}
