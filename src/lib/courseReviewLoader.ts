import { getDueCards, type SrsCard } from '../api/srs';
import { courseReviewRepository } from '../repositories/CourseReviewRepository';
import {
  buildReviewSet,
  groupByDeck,
  padNeeded,
  resolveDueWords,
  type CourseReviewSet,
} from './courseReviewSet';

/**
 * Composes the server due queue and the local word database into ready-to-run
 * review sets — the one place remote SRS state and local decks meet.
 *
 * It lives here rather than in `src/api/` because it is not an endpoint
 * wrapper: `src/api/` stays purely remote, `src/repositories/` purely local,
 * and this reads from both. All the decision-making it does is delegated to the
 * pure functions in `courseReviewSet`; what remains is fetching and ordering.
 */

export interface DeckReviewSet extends CourseReviewSet {
  deckTitle: string;
}

export interface CourseReviewOverview {
  /** One runnable session per deck, most due words first. */
  sets: DeckReviewSet[];
  /** Due words that can actually be drilled, across all decks. */
  totalDue: number;
  /**
   * Due cards with no local word — their vocabulary list was never imported,
   * or the word was added upstream after the last import. Surfaced so the UI
   * can offer an import rather than pretending the queue is empty.
   */
  unresolvedCardIds: string[];
  /** The lists behind `unresolvedCardIds`, deduped — what the import CTA offers. */
  unresolvedListIds: string[];
}

export interface LoadCourseReviewOptions {
  /**
   * Translation language for card content. Course seeds are language-specific
   * (ny-i-norge-a2 has `ru` only), and the wrong one legitimately returns
   * `immersionMode: true` with no translation.
   */
  language: string;
  /** Server caps this at 100. */
  limit?: number;
}

const DEFAULT_DUE_LIMIT = 100;

export async function loadCourseReviewSets(
  options: LoadCourseReviewOptions,
): Promise<CourseReviewOverview> {
  const [envelope, linkedWords] = await Promise.all([
    getDueCards({
      limit: options.limit ?? DEFAULT_DUE_LIMIT,
      language: options.language,
      includeExamples: false,
    }),
    courseReviewRepository.getLinkedWords(),
  ]);

  return composeReviewSets(envelope.cards, linkedWords);
}

/** Split out from the fetch so a caller with cards in hand can reuse it. */
async function composeReviewSets(
  cards: SrsCard[],
  linkedWords: Awaited<ReturnType<typeof courseReviewRepository.getLinkedWords>>,
): Promise<CourseReviewOverview> {
  const { resolved, unresolvedCardIds, unresolvedListIds } = resolveDueWords(cards, linkedWords);
  const byDeck = groupByDeck(resolved);

  const titles = await courseReviewRepository.getDeckTitles([...byDeck.keys()]);

  const sets: DeckReviewSet[] = [];
  for (const [deckId, due] of byDeck) {
    const needed = padNeeded(due.length);
    const padCandidates =
      needed > 0
        ? await courseReviewRepository.getPaddingCandidates(
            deckId,
            due.map((word) => word.wordId),
            // Over-fetch: `buildReviewSet` drops collisions, and a deck can be
            // smaller than the request.
            needed * 2,
          )
        : [];

    sets.push({
      ...buildReviewSet(deckId, due, padCandidates),
      deckTitle: titles.get(deckId) ?? '',
    });
  }

  return { sets, totalDue: resolved.length, unresolvedCardIds, unresolvedListIds };
}
