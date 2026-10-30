import { useCallback, useEffect, useState } from 'react';
import { listMyWords } from '../api/personalVocabulary';
import { deckRepository, type Deck } from '../repositories/DeckRepository';
import type { CourseReviewOverview } from '../lib/courseReviewLoader';
import { useCourseReviewSets } from './useCourseReviewSets';
import { useGrammarDue, type GrammarDue } from './useGrammarDue';
import { useMistakes } from './useMistakes';
import type { MergedMistakes } from '../lib/mistakes';
import { useUiLanguage } from '../i18n';

export interface MyWordsSummary {
  total: number;
  /** Words still waiting for a translation. */
  pending: number;
}

type Part<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error' };

export interface PracticeHome {
  /** The review queue behind the hero; `null` until loaded or when it failed. */
  overview: CourseReviewOverview | null;
  overviewStatus: 'loading' | 'loaded' | 'error';
  overviewOffline: boolean;
  /** Word sets, those with something due first. `null` when they could not be read. */
  decks: Deck[] | null;
  /** The sets are being read for the first time — the root draws placeholder rows. */
  decksLoading: boolean;
  /** «My words» totals from the server's list; `null` offline or on failure. */
  myWords: MyWordsSummary | null;
  /** Rules due for review; `null` when unknown or switched off. */
  grammar: GrammarDue | null;
  /** Exercises with an uncorrected mistake, offline included; `null` when unknown. */
  mistakes: MergedMistakes | null;
  loading: boolean;
  reload: () => void;
}

/** Decks with words due come first; the repository's order (favourites, sort) is kept within. */
export function orderDecks(decks: readonly Deck[]): Deck[] {
  return decks
    .map((deck, i) => ({ deck, i }))
    .sort(
      (a, b) =>
        Number(b.deck.repeatWords > 0) - Number(a.deck.repeatWords > 0) || a.i - b.i,
    )
    .map(x => x.deck);
}

/**
 * Everything the Practice root shows, each part loaded on its own (Practice §6.4): the queue
 * overview, the word sets, «My words», the rules due and the mistakes. A part that fails hides only its own
 * section — no part waits for another, and none forces a sync on the root.
 */
export function usePracticeHome(): PracticeHome {
  const uiLanguage = useUiLanguage();
  const sets = useCourseReviewSets();
  const [decks, setDecks] = useState<Part<Deck[]>>({ status: 'loading' });
  const [myWords, setMyWords] = useState<Part<MyWordsSummary>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const grammar = useGrammarDue(nonce);
  const mistakes = useMistakes(nonce);

  useEffect(() => {
    let live = true;
    deckRepository
      .getAll()
      .then(all => live && setDecks({ status: 'loaded', data: orderDecks(all) }))
      .catch(() => live && setDecks({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [nonce]);

  useEffect(() => {
    let live = true;
    listMyWords({ translationLanguage: uiLanguage })
      .then(words => {
        if (!live) return;
        setMyWords({
          status: 'loaded',
          data: {
            total: words.length,
            pending: words.filter(w => w.status === 'pending').length,
          },
        });
      })
      .catch(() => live && setMyWords({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [uiLanguage, nonce]);

  const { reload: reloadSets } = sets;
  const reload = useCallback(() => {
    setNonce(n => n + 1);
    reloadSets();
  }, [reloadSets]);

  return {
    overview: sets.overview,
    overviewStatus: sets.loading ? 'loading' : sets.error ? 'error' : 'loaded',
    overviewOffline: sets.offline,
    decks: decks.status === 'loaded' ? decks.data : null,
    decksLoading: decks.status === 'loading',
    myWords: myWords.status === 'loaded' ? myWords.data : null,
    grammar,
    mistakes,
    loading:
      sets.loading || decks.status === 'loading' || myWords.status === 'loading',
    reload,
  };
}
