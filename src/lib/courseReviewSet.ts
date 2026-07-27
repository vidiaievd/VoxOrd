import type { SrsCard, SrsCardState } from '../api/srs';

/**
 * Turns the server's global due queue into something the existing word
 * exercises can actually be driven with.
 *
 * Why this shape:
 *
 * 1. **The join key is `platformItemId`, held in memory.** A VOCABULARY_WORD
 *    card's `contentId` is the platform vocabulary *item* id, which the Phase
 *    5.2 importer already stores on the local row (`words.platformItemId`,
 *    migration v8). So a due card maps to a local word with a lookup, and the
 *    `cardId` lives only for the duration of the session — no schema change,
 *    no second copy of server truth on the device (decided with the user,
 *    2026-07-27).
 *
 * 2. **A session is scoped to one deck.** Every exercise query joins
 *    `deck_words ON deckId = ?` *and* the override filter (QuizRepository.ts),
 *    so a word set that spans two imported lists would silently lose half its
 *    words. Due cards are therefore grouped by deck and each group is its own
 *    session.
 *
 * 3. **Small sets need padding.** `QuizRepository`/`ListeningRepository` bail
 *    out with an empty exercise when the pool holds fewer than 4 words. Rather
 *    than hiding those modes when only 1-3 words are due, the set is padded
 *    with other words from the same deck; padding is drilled but **never
 *    graded** — only `due` words produce a review event.
 *
 * No I/O here. The deck-local padding candidates are fetched by
 * `CourseReviewRepository` and handed back in.
 */

/**
 * Below this, `QuizRepository.ts:45` / `ListeningRepository.ts:46` return an
 * empty question list (they need 4 options to build a question).
 */
export const MIN_POOL_SIZE = 4;

/** A local word row carrying its platform linkage, as stored since v8. */
export interface LinkedWordRow {
  wordId: number;
  deckId: number;
  platformItemId: string;
}

/** A due server card successfully matched to a local word. */
export interface CourseDueWord {
  cardId: string;
  wordId: number;
  deckId: number;
  state: SrsCardState;
  /** The server's word text — used for logging and for NEW-card previews. */
  word: string;
}

export interface CourseReviewSet {
  deckId: number;
  /** Cards to be graded and reviewed at the end of the session. */
  due: CourseDueWord[];
  /** Deck words mixed in only to make 4-option modes buildable. Not graded. */
  padWordIds: number[];
  /** What to pass to the exercise hooks as `overrideWordIds`. */
  wordIds: number[];
}

export interface ResolvedDueWords {
  resolved: CourseDueWord[];
  /**
   * Due cards whose vocabulary item is not in any local deck — the list was
   * never imported, or was imported before the word was added upstream. They
   * cannot be drilled locally, so the caller must not silently treat them as
   * reviewed.
   */
  unresolvedCardIds: string[];
}

/**
 * Matches due cards against local rows. Only VOCABULARY_WORD cards that
 * arrived with content are considered — an EXERCISE card has no word to drill,
 * and a card whose content lookup failed server-side has no `front.word`.
 */
export function resolveDueWords(
  cards: SrsCard[],
  linkedWords: LinkedWordRow[],
): ResolvedDueWords {
  const byItemId = new Map<string, LinkedWordRow>();
  for (const row of linkedWords) {
    // A word can only sit in one imported deck (partial-unique platformItemId),
    // so first match wins and there is nothing to disambiguate.
    if (!byItemId.has(row.platformItemId)) byItemId.set(row.platformItemId, row);
  }

  const resolved: CourseDueWord[] = [];
  const unresolvedCardIds: string[] = [];
  const seenWordIds = new Set<number>();

  for (const card of cards) {
    if (card.contentType !== 'VOCABULARY_WORD') continue;
    const word = card.front?.word;
    if (!word) continue;

    const row = byItemId.get(card.contentId);
    if (!row) {
      unresolvedCardIds.push(card.id);
      continue;
    }
    // Defensive: two cards pointing at one local word would drill it twice and
    // then post two reviews for the same word.
    if (seenWordIds.has(row.wordId)) continue;
    seenWordIds.add(row.wordId);

    resolved.push({
      cardId: card.id,
      wordId: row.wordId,
      deckId: row.deckId,
      state: card.state,
      word,
    });
  }

  return { resolved, unresolvedCardIds };
}

/** Splits resolved due words into per-deck buckets, largest bucket first. */
export function groupByDeck(due: CourseDueWord[]): Map<number, CourseDueWord[]> {
  const byDeck = new Map<number, CourseDueWord[]>();
  for (const word of due) {
    const bucket = byDeck.get(word.deckId);
    if (bucket) bucket.push(word);
    else byDeck.set(word.deckId, [word]);
  }

  return new Map(
    [...byDeck.entries()].sort(
      ([deckA, a], [deckB, b]) => b.length - a.length || deckA - deckB,
    ),
  );
}

/**
 * How many extra deck words are needed for the 4-option modes to build a
 * question at all. Zero once the due set is big enough.
 */
export function padNeeded(dueCount: number, minPoolSize = MIN_POOL_SIZE): number {
  return Math.max(0, minPoolSize - dueCount);
}

/**
 * Assembles the final set. `padCandidates` are deck words that are *not* due;
 * only as many as needed are taken, and any that collide with a due word are
 * dropped so a word is never both graded and filler.
 */
export function buildReviewSet(
  deckId: number,
  due: CourseDueWord[],
  padCandidates: number[],
  minPoolSize = MIN_POOL_SIZE,
): CourseReviewSet {
  const dueIds = new Set(due.map((word) => word.wordId));
  const needed = padNeeded(due.length, minPoolSize);
  const padWordIds: number[] = [];

  for (const candidate of padCandidates) {
    if (padWordIds.length >= needed) break;
    if (dueIds.has(candidate)) continue;
    if (padWordIds.includes(candidate)) continue;
    padWordIds.push(candidate);
  }

  return {
    deckId,
    due,
    padWordIds,
    wordIds: [...due.map((word) => word.wordId), ...padWordIds],
  };
}

/**
 * Ordered modes of a course review session.
 *
 * `preview` is the flashcard screen in its non-scoring `review` mode: a card
 * the user has never seen cannot be *tested*, and the swipe is self-report
 * (`useCard.ts`: `isCorrect = direction === 'right'`), which is exactly the
 * input this redesign removes. It shows the NEW words and awards nothing.
 *
 * `context` and `matching` are absent by design: matching inflates "correct"
 * as its pool narrows, and the context query needs `word_examples` rows with
 * `isContextSentence = 1`, which the importer never writes — for a course deck
 * it returns nothing regardless of client work.
 */
export type CourseReviewPhase = 'preview' | 'listening' | 'quiz' | 'spelling';

/** Due words the user has never studied — previewed, never graded. */
export function newCardWordIds(set: CourseReviewSet): number[] {
  return set.due.filter((word) => word.state === 'NEW').map((word) => word.wordId);
}

/**
 * Which modes this set can actually run.
 *
 * The 4-option modes are dropped when even the padded set cannot reach the
 * minimum — a deck smaller than four words. Letting them run would show the
 * exercise's "not enough words" dead end mid-session. Spelling has no such
 * floor, so a tiny deck still gets a real, gradeable session.
 */
export function planPhases(
  set: CourseReviewSet,
  previewWordIds: number[],
  minPoolSize = MIN_POOL_SIZE,
): CourseReviewPhase[] {
  if (set.wordIds.length === 0) return [];

  const phases: CourseReviewPhase[] = [];
  if (previewWordIds.length > 0) phases.push('preview');
  if (set.wordIds.length >= minPoolSize) phases.push('listening', 'quiz');
  phases.push('spelling');
  return phases;
}

/**
 * Whether an answer for this word counts toward a rating. Padding words are
 * drilled for the user's benefit but must leave the server schedule alone.
 */
export function isGraded(set: CourseReviewSet, wordId: number): boolean {
  return set.due.some((word) => word.wordId === wordId);
}

/** The card a graded word belongs to, for posting the review at session end. */
export function cardIdForWord(set: CourseReviewSet, wordId: number): string | null {
  return set.due.find((word) => word.wordId === wordId)?.cardId ?? null;
}
