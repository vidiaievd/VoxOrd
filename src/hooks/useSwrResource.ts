import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMemoryCache,
  setMemoryCache,
  readCacheSnapshot,
  writeCacheSnapshot,
} from '../lib/swrCache';

export interface SwrResourceState<T> {
  status: 'loading' | 'loaded' | 'error';
  data: T | null;
  error: Error | null;
  refreshing: boolean;
  /** True while `data` is a cached value shown ahead of (or instead of, on failure) a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate resource: renders a cached value instantly (memory
 * first, then the persisted snapshot on a cold start) while always kicking a
 * background fetch, so reopening a recently-viewed screen never shows a bare
 * spinner. Passing `key: null` skips loading entirely (e.g. before auth is
 * ready) — mirrors the existing `useMyCourses`/`useCourseHome` shape rather
 * than introducing a new one.
 */
export function useSwrResource<T>(
  key: string | null,
  loader: () => Promise<T>,
): SwrResourceState<T> {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!key) return;
      if (isRefresh) setRefreshing(true);

      let hasShownCached = false;
      if (!isRefresh) {
        const mem = getMemoryCache<T>(key);
        if (mem !== undefined) {
          hasShownCached = true;
          setData(mem);
          setStatus('loaded');
          setStale(true);
        } else {
          setStatus('loading');
          // Snapshot read is async; only apply it if the network fetch below
          // hasn't already resolved (avoids clobbering fresher data with a
          // slower-arriving stale one).
          readCacheSnapshot<T>(key).then((snap) => {
            if (snap !== null && mounted.current && !hasShownCached) {
              hasShownCached = true;
              setData(snap);
              setStatus('loaded');
              setStale(true);
            }
          });
        }
      }

      try {
        const fresh = await loaderRef.current();
        hasShownCached = true; // fresh data wins over a late snapshot read
        if (!mounted.current) return;
        setData(fresh);
        setStatus('loaded');
        setError(null);
        setStale(false);
        setMemoryCache(key, fresh);
        void writeCacheSnapshot(key, fresh);
      } catch (e) {
        if (!mounted.current) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        // A cached value (memory or snapshot, possibly still arriving) stays
        // on screen — only show the error state when there's nothing to fall
        // back on.
        if (hasShownCached) {
          setStale(true);
        } else {
          setStatus('error');
        }
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [key],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { status, data, error, refreshing, stale, refresh };
}
