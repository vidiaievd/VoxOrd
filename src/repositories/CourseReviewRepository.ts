import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import type { LinkedWordRow } from '../lib/courseReviewSet';

/**
 * Read-only lookups that bridge the server's SRS due queue to the local word
 * database.
 *
 * Scope note: ground rule #1 keeps course code out of `src/repositories/`,
 * with the linkage work agreed as the exception (the same one Phase 5.2's
 * importer was built under). This file only ever SELECTs — nothing here writes
 * to the word database, and no existing repository is modified.
 *
 * The join key is `words.platformItemId` (migration v8/v9), which holds the
 * platform vocabulary *item* id — exactly what a VOCABULARY_WORD card carries
 * as `contentId`. The SRS `cardId` itself is deliberately not stored: it lives
 * in session memory only, so the device never keeps a stale second copy of
 * server truth (decided with the user, 2026-07-27).
 */
class CourseReviewRepository {
  /**
   * Every imported course word, with the deck it belongs to.
   *
   * Words are matched to due cards in memory rather than by pushing the card
   * ids into SQL: the due queue is small (server default 20, capped at 100)
   * and this keeps the resolution logic pure and unit-tested.
   */
  async getLinkedWords(): Promise<LinkedWordRow[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT w.id AS wordId, dw.deckId, w.platformItemId
       FROM ${TABLE.WORDS} w
       JOIN ${TABLE.DECK_WORDS} dw ON dw.wordId = w.id
       WHERE w.platformItemId IS NOT NULL;`,
    );

    return (result.rows ?? []).map((row) => ({
      wordId: row.wordId as number,
      deckId: row.deckId as number,
      platformItemId: row.platformItemId as string,
    }));
  }

  /**
   * Other words from the same deck, used to pad a due set of 1-3 words up to
   * the four the multiple-choice modes need to build a question at all.
   *
   * Weakest first, so the filler is at least the most useful filler available.
   * The caller drops any that collide with a due word (`buildReviewSet`), so a
   * generous limit is fine; `excludeWordIds` is only an optimisation.
   */
  async getPaddingCandidates(
    deckId: number,
    excludeWordIds: number[],
    limit: number,
  ): Promise<number[]> {
    if (limit <= 0) return [];
    const db = getDatabase();

    // Word ids come from SQLite, never from user input, so interpolating the
    // IN list is safe here — the same pattern the exercise repositories use for
    // `overrideWordIds`.
    const exclusion =
      excludeWordIds.length > 0 ? `AND w.id NOT IN (${excludeWordIds.join(',')})` : '';

    const result = await db.execute(
      `SELECT w.id AS wordId
       FROM ${TABLE.WORDS} w
       JOIN ${TABLE.DECK_WORDS} dw ON dw.wordId = w.id AND dw.deckId = ?
       LEFT JOIN ${TABLE.WORD_MODE_STRENGTH} wms
         ON wms.wordId = w.id AND wms.deckId = ?
       ${exclusion}
       GROUP BY w.id
       ORDER BY COALESCE(MIN(wms.strength), -1.0) ASC, RANDOM()
       LIMIT ?;`,
      [deckId, deckId, limit],
    );

    return (result.rows ?? []).map((row) => row.wordId as number);
  }

  /** Deck titles for the decks a review session can be started from. */
  async getDeckTitles(deckIds: number[]): Promise<Map<number, string>> {
    if (deckIds.length === 0) return new Map();
    const db = getDatabase();
    const result = await db.execute(
      `SELECT id, title FROM ${TABLE.DECKS} WHERE id IN (${deckIds.join(',')});`,
    );

    const titles = new Map<number, string>();
    for (const row of result.rows ?? []) {
      titles.set(row.id as number, row.title as string);
    }
    return titles;
  }
}

export const courseReviewRepository = new CourseReviewRepository();
