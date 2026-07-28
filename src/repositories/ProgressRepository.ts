import { getDatabase } from '../db/database';
import { TABLE, WordProgress, MemoryStage } from '../db/types';
import { SpacedRepetition } from '../learning-engine/SpacedRepetition';

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
