import { useCallback, useEffect, useState } from 'react';
import { isNetworkError } from '../api/isNetworkError';
import {
  loadCourseReviewSets,
  type CourseReviewOverview,
  type DeckReviewSet,
} from '../lib/courseReviewLoader';
import { deckRepository, type Deck } from '../repositories/DeckRepository';
import { useSettings } from './useSettings';

/**
 * Loads the server due queue, resolves it against the imported course decks and
 * returns one runnable session per deck.
 *
 * Not cached through `useSwrResource`: a due queue is the one thing that must
 * never be painted stale — showing yesterday's due words would have the user
 * drill cards that are no longer due and reschedule them wrongly.
 */

export interface CourseReviewSetsState {
  loading: boolean;
  error: boolean;
  offline: boolean;
  overview: CourseReviewOverview | null;
  /** Deck rows for the sets, needed by the flashcard preview screen. */
  decks: Map<number, Deck>;
  reload: () => void;
}

export function useCourseReviewSets(): CourseReviewSetsState {
  const settings = useSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [overview, setOverview] = useState<CourseReviewOverview | null>(null);
  const [decks, setDecks] = useState<Map<number, Deck>>(new Map());
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      setOffline(false);
      try {
        // The course seeds are language-specific: asking for the wrong language
        // legitimately returns immersionMode with no translation.
        const [result, allDecks] = await Promise.all([
          loadCourseReviewSets({ language: settings.uiLanguage }),
          deckRepository.getAll(),
        ]);
        if (cancelled) return;
        setOverview(result);
        setDecks(new Map(allDecks.map((deck) => [deck.id, deck])));
      } catch (e) {
        if (cancelled) return;
        setError(true);
        setOffline(isNetworkError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.uiLanguage, nonce]);

  return { loading, error, offline, overview, decks, reload };
}

/** The session to offer first: the deck with the most words waiting. */
export function primarySet(overview: CourseReviewOverview | null): DeckReviewSet | null {
  return overview?.sets[0] ?? null;
}
