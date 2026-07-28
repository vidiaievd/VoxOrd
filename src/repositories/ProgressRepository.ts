import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import type { ReviewRating } from '../api/srs';
import { cardValues, FSRS_SET_CLAUSE, readCard } from '../srs/cardRow';
import type { SrsCard } from '../srs/engine.port';
import { FsrsAdapter, needsProfileMigration } from '../srs/fsrs-adapter';

/**
 * One engine instance for the whole app. Constructing `FSRS` parses the 21
 * weights, and every personal word is scheduled by the same frozen profile
 * anyway — see `srs/profiles.ts`.
 */
const engine = new FsrsAdapter();

/** Warn once per profile mismatch, not once per reviewed word. */
const warnedForeignProfiles = new Set<string>();

class ProgressRepository {
  /**
   * Reschedules a personal word with the on-device FSRS engine.
   *
   * The only writer of a local schedule since Step 9.5 retired the 6-stage
   * engine. Called **once per word at session end**, not per answer: a rating
   * is a judgement about a whole sitting (`gradePersonalWord`), which is why
   * the per-answer `recordAnswer` it replaced could not simply be adapted.
   *
   * The 6-stage columns are left untouched rather than dropped — v10 kept them
   * so that rollback means "stop reading the new columns"; a later migration
   * removes them now that this path is the only one.
   *
   * Returns the rescheduled card, or `null` when nothing was written — no
   * progress row, or a course word.
   */
  async applyReview(
    wordId: number,
    deckId: number,
    rating: ReviewRating,
    reviewedAt: number = Date.now(),
  ): Promise<SrsCard | null> {
    const db = getDatabase();

    // The course-word guard lives in SQL rather than in the caller because
    // Phase 5.2's "Save to VoxOrd deck" put server-owned words into ordinary
    // local decks. Their schedule belongs to the server (Phase 8) and giving
    // them a second, local one is the duplicated-source-of-truth bug this whole
    // redesign exists to remove. The v10 backfill skipped them on the same rule.
    const result = await db.execute(
      `SELECT wp.* FROM ${TABLE.WORD_PROGRESS} wp
         JOIN ${TABLE.WORDS} w ON w.id = wp.wordId
        WHERE wp.wordId = ? AND wp.deckId = ?
          AND w.platformItemId IS NULL;`,
      [wordId, deckId],
    );

    const row = result.rows?.[0];
    if (!row) return null;

    // A NULL profile is the normal "not an FSRS card yet" state — see
    // `readCard`. Introducing at `reviewedAt` and immediately reviewing is
    // exactly how the server handles a first review, so the two agree.
    const stored = readCard(row);
    if (stored && needsProfileMigration(stored, engine)) {
      // Continue rather than reset: the numbers came from a different profile,
      // but discarding a card's history is worse than carrying it forward, and
      // `review()` restamps the profile on the way out.
      if (!warnedForeignProfiles.has(stored.profileId)) {
        warnedForeignProfiles.add(stored.profileId);
        console.warn(
          `[SRS] rescheduling cards stamped "${stored.profileId}" with engine profile "${engine.profileId}"`,
        );
      }
    }

    const card = engine.review(stored ?? engine.introduce(reviewedAt), rating, reviewedAt);

    await db.execute(
      `UPDATE ${TABLE.WORD_PROGRESS} SET ${FSRS_SET_CLAUSE} WHERE id = ?;`,
      [...cardValues(card), row.id as number],
    );

    return card;
  }

}

export const progressRepository = new ProgressRepository();
