import { useState, useEffect, useCallback } from 'react';
import { homeRepository, HomeScreenData } from '../repositories/HomeRepository';

interface UseHomeDataResult {
  data: HomeScreenData | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useHomeData(): UseHomeDataResult {
  const [data, setData] = useState<HomeScreenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await homeRepository.getHomeData();
    setData(result);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, isLoading, refresh: load };
}
