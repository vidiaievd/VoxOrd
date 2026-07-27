import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDueCards, vocabularyCards, type ReviewRating, type SrsCard } from '../api/srs';
import { isNetworkError } from '../api/isNetworkError';
import { reviewQueueStore } from '../store/reviewQueueStore';
import { useSettings } from './useSettings';

/** How many cards to pull per session. The server caps `limit` at 100. */
const SESSION_LIMIT = 50;

export interface SrsReviewSession {
  loading: boolean;
  /** Set when the queue could not be loaded at all. */
  loadError: string | null;
  offline: boolean;
  card: SrsCard | null;
  revealed: boolean;
  reveal: () => void;
  rate: (rating: ReviewRating) => void;
  reload: () => void;
  reviewedCount: number;
  remainingCount: number;
  /** Answers waiting to reach the server. */
  pendingCount: number;
  finished: boolean;
}

/**
 * Drives one review session over the server's due queue. Course words are
 * server-authoritative: this never schedules anything, it submits an answer
 * and moves on. Submission goes through `reviewQueueStore`, so a lost
 * connection queues the answer instead of losing it and the session keeps
 * running offline.
 */
export function useSrsReview(): SrsReviewSession {
  const { uiLanguage } = useSettings();
  const [cards, setCards] = useState<SrsCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => reviewQueueStore.subscribe(() => {
    if (mounted.current) setPendingCount(reviewQueueStore.pendingCount);
  }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      // Replay anything left from an earlier offline session first, so the due
      // list reflects those answers instead of offering the same cards again.
      await reviewQueueStore.load();
      await reviewQueueStore.flush();

      try {
        const envelope = await getDueCards({
          limit: SESSION_LIMIT,
          language: uiLanguage,
          includeExamples: true,
        });
        if (cancelled) return;
        setCards(vocabularyCards(envelope.cards));
        setIndex(0);
        setRevealed(false);
        setOffline(false);
      } catch (e) {
        if (cancelled) return;
        setOffline(isNetworkError(e));
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uiLanguage, reloadToken]);

  const card = cards[index] ?? null;

  const rate = useCallback(
    (rating: ReviewRating) => {
      if (!card) return;

      // Advance immediately: the answer is durable once queued, and waiting on
      // the round trip would stall the session on a slow connection.
      setIndex((i) => i + 1);
      setRevealed(false);

      reviewQueueStore
        .submit(card.id, rating)
        .then((serverCard) => {
          if (mounted.current) setOffline(serverCard === null);
        })
        .catch(() => {
          if (mounted.current) setOffline(true);
        });
    },
    [card],
  );

  const reveal = useCallback(() => setRevealed(true), []);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return useMemo(
    () => ({
      loading,
      loadError,
      offline,
      card,
      revealed,
      reveal,
      rate,
      reload,
      reviewedCount: Math.min(index, cards.length),
      remainingCount: Math.max(cards.length - index, 0),
      pendingCount,
      finished: !loading && !loadError && cards.length > 0 && index >= cards.length,
    }),
    [loading, loadError, offline, card, revealed, reveal, rate, reload, index, cards.length, pendingCount],
  );
}
