import { getDatabase } from '../db/database';
import { TABLE, WordProgress, MemoryStage } from '../db/types';
import { SpacedRepetition } from '../learning-engine/SpacedRepetition';
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
  async get(wordId: number, deckId: number): Promise<WordProgress | null> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.WORD_PROGRESS}
       WHERE wordId = ? AND deckId = ?;`,
      [wordId, deckId],
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return this.toModel(row);
  }

  async getDueWords(
    deckId: number,
    limit: number = 20,
  ): Promise<WordProgress[]> {
    const db = getDatabase();
    const now = Date.now();

    const result = await db.execute(
      `SELECT * FROM ${TABLE.WORD_PROGRESS}
       WHERE deckId = ?
         AND (nextReview IS NULL OR nextReview <= ?)
       ORDER BY
         memoryStage  ASC,
         reviewCount  ASC
       LIMIT ?;`,
      [deckId, now, limit],
    );
    return (result.rows ?? []).map(this.toModel);
  }

  async recordAnswer(
    wordId: number,
    deckId: number,
    isCorrect: boolean,
  ): Promise<{ xpEarned: number }> {
    const progress = await this.get(wordId, deckId);
    if (!progress) return { xpEarned: 0 };

    const result = SpacedRepetition.processAnswer({
      isCorrect,
      currentStage: progress.memoryStage,
      reviewCount: progress.reviewCount,
      successCount: progress.successCount,
      shortTermStrength: progress.shortTermStrength,
      longTermStrength: progress.longTermStrength,
    });

    const db = getDatabase();
    await db.execute(
      `UPDATE ${TABLE.WORD_PROGRESS}
       SET memoryStage        = ?,
           nextReview         = ?,
           lastReviewed       = ?,
           reviewCount        = reviewCount + 1,
           successCount       = successCount + ?,
           shortTermStrength  = ?,
           longTermStrength   = ?,
           status             = ?
       WHERE wordId = ? AND deckId = ?;`,
      [
        result.newStage,
        result.nextReview,
        Date.now(),
        isCorrect ? 1 : 0,
        result.shortTermStrength,
        result.longTermStrength,
        result.newStatus,
        wordId,
        deckId,
      ],
    );

    return { xpEarned: result.xpEarned };
  }

  /**
   * Reschedules a personal word with the on-device FSRS engine (plan Step 9.4).
   *
   * Sits **beside** `recordAnswer`, which keeps writing the 6-stage columns
   * unchanged, because everything that reads a schedule — `getNextWord`, deck
   * counts, stats, "Stage N" — still speaks 6-stage until Step 9.5. Writing
   * both means this step is testable on device against "behaves exactly as
   * before", and keeps 9.3's rollback story intact: reverting is "stop reading
   * the new columns", never a conversion back.
   *
   * The two are also fed differently and cannot be merged: `recordAnswer` takes
   * one binary answer, while a rating is a judgement about a whole session
   * (`gradePersonalWord`), so this is called once per word at session end.
   *
   * Returns the rescheduled card, or `null` when nothing was written — no
   * progress row (matching `recordAnswer`'s silent no-op), or a course word.
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

  async getStageDistribution(
    deckId: number,
  ): Promise<Record<MemoryStage, number>> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT memoryStage, COUNT(*) as count
       FROM ${TABLE.WORD_PROGRESS}
       WHERE deckId = ?
       GROUP BY memoryStage;`,
      [deckId],
    );

    const dist: Record<MemoryStage, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (const row of result.rows ?? []) {
      const stage = row.memoryStage as MemoryStage;
      dist[stage] = row.count as number;
    }

    return dist;
  }

  private toModel(row: Record<string, unknown>): WordProgress {
    return {
      id: row.id as number,
      wordId: row.wordId as number,
      deckId: row.deckId as number,
      status: row.status as WordProgress['status'],
      memoryStage: (row.memoryStage ?? 0) as MemoryStage,
      nextReview: row.nextReview as number | null,
      lastReviewed: row.lastReviewed as number | null,
      reviewCount: (row.reviewCount ?? 0) as number,
      successCount: (row.successCount ?? 0) as number,
      shortTermStrength: (row.shortTermStrength ?? 0) as number,
      longTermStrength: (row.longTermStrength ?? 0) as number,
    };
  }
}

export const progressRepository = new ProgressRepository();
