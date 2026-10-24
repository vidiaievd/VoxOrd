import { useEffect, useRef, useState } from 'react';
import { getSrsStats, type SrsStats } from '../api/srs';
import {
  shouldUseReplica,
  vocabularyReplica,
} from '../services/vocabularyReplica';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

/** A count older than this is fetched again when the learner comes back to a tab. */
export const DUE_COUNT_MAX_AGE_MS = 60_000;

export interface DueCount {
  /** Cards due now; `null` when it cannot be known — no badge, no number. */
  count: number | null;
  /** Counted from the phone's copy because the server was out of reach. */
  fromReplica: boolean;
  status: 'loading' | 'loaded' | 'unavailable';
}

/**
 * How many cards are due for review now — the one number the Practice badge, Today and the
 * Practice hero all show (decision D3), so they never disagree.
 *
 * Online it is the server's `dueNowCount`, under the `srs-stats` key Today already reads.
 * With the server out of reach it is counted from the phone's copy of the cards, which
 * also knows the reviews done offline; without a copy it is unknown.
 *
 * `focusKey` is whatever changes when the learner arrives somewhere new (the navigator
 * passes the screen); on a change the count is fetched again if it is over a minute old.
 */
export function useDueCount(focusKey?: string): DueCount {
  const { status: auth } = useAuth();
  const signedIn = auth === 'signedIn';
  const srs = useSwrResource<SrsStats>(
    signedIn ? 'srs-stats' : null,
    getSrsStats,
  );
  const offline = srs.error !== null && shouldUseReplica(srs.error);

  // undefined while the copy is being read; null when there is no copy.
  const [fromCopy, setFromCopy] = useState<number | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!offline) {
      setFromCopy(undefined);
      return;
    }
    let live = true;
    vocabularyReplica
      .dueCount()
      .then(n => live && setFromCopy(n))
      .catch(() => live && setFromCopy(null));
    return () => {
      live = false;
    };
    // focusKey: a review done offline changes the copy's count; read it again on arrival.
  }, [offline, focusKey]);

  const fetchedAt = useRef(0);
  useEffect(() => {
    if (srs.data !== null && !srs.stale) fetchedAt.current = Date.now();
  }, [srs.data, srs.stale]);

  const { refresh } = srs;
  const firstFocus = useRef(true);
  useEffect(() => {
    // The first focus is the mount, which fetches anyway.
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    if (!signedIn) return;
    if (Date.now() - fetchedAt.current > DUE_COUNT_MAX_AGE_MS) void refresh();
  }, [focusKey, signedIn, refresh]);

  if (offline) {
    if (fromCopy === undefined)
      return { count: null, fromReplica: false, status: 'loading' };
    if (fromCopy === null)
      return { count: null, fromReplica: false, status: 'unavailable' };
    return { count: fromCopy, fromReplica: true, status: 'loaded' };
  }
  if (srs.data !== null) {
    return {
      count: srs.data.dueNowCount,
      fromReplica: false,
      status: 'loaded',
    };
  }
  return {
    count: null,
    fromReplica: false,
    status: srs.status === 'error' || !signedIn ? 'unavailable' : 'loading',
  };
}
