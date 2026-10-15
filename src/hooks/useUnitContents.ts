import { useCallback } from 'react';
import { getUnitContents } from '../api/unitContents';
import type { UnitContentsResult } from '../api/types';
import { useSwrResource } from './useSwrResource';

export interface UnitContentsState {
  status: 'loading' | 'loaded' | 'error';
  data: UnitContentsResult | null;
  error: Error | null;
  refreshing: boolean;
  /** True while `data` is a cached value shown ahead of (or instead of, offline) a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate, like the course home before it. Without a snapshot here a unit
 * opened before could not be opened offline, and with it every lesson cached behind it was
 * out of reach too.
 */
export function useUnitContents(unitId: string): UnitContentsState {
  const loader = useCallback(() => getUnitContents(unitId), [unitId]);
  return useSwrResource<UnitContentsResult>(`unit-contents:${unitId}`, loader);
}
