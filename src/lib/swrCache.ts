import { createAsyncStorage } from '@react-native-async-storage/async-storage';

const storage = createAsyncStorage('voxord_swr_cache');

/**
 * Passive stale-while-revalidate cache for read-only course data (course
 * list, course home) — Phase 6. Two tiers:
 *  - in-memory: instant, but empty again after an app restart.
 *  - AsyncStorage snapshot: survives restarts, read once per key per process
 *    (see `useSwrResource`), so a cold-started screen can render the last
 *    known state before the network round-trip completes.
 *
 * Deliberately NOT a general offline cache: nothing here is a queue, there's
 * no invalidation beyond "a fresher fetch overwrites it", and callers are
 * expected to key entries so a stale value is never wrong-but-plausible
 * (e.g. include courseId, and a version/updatedAt where the payload can
 * change shape over time).
 */
const memoryCache = new Map<string, unknown>();

export function getMemoryCache<T>(key: string): T | undefined {
  return memoryCache.get(key) as T | undefined;
}

export function setMemoryCache<T>(key: string, data: T): void {
  memoryCache.set(key, data);
}

export async function readCacheSnapshot<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[SwrCache] Failed to read snapshot for "${key}":`, e);
    return null;
  }
}

export async function writeCacheSnapshot<T>(key: string, data: T): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`[SwrCache] Failed to write snapshot for "${key}":`, e);
  }
}
