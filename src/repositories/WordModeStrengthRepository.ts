import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { ExerciseType } from '../db/types';

const STRENGTH_GAIN = 0.25;
const STRENGTH_LOSS = 0.35;
const STRENGTH_MAX = 1.0;
const STRENGTH_MIN = 0.0;

// Threshold below which a word is considered weak in this mode
const WEAK_THRESHOLD = 0.5;

export interface ModeStrengthRecord {
  wordId: number;
  deckId: number;
  exerciseType: ExerciseType;
  strength: number;
  errorCount: number;
  reviewCount: number;
  lastReviewed: number | null;
}

export interface WeakWord {
  wordId: number;
  strength: number;
}

class WordModeStrengthRepository {
  // Record answer — upsert strength for word+deck+mode
  async recordAnswer(
    wordId: number,
    deckId: number,
    exerciseType: ExerciseType,
    isCorrect: boolean,
  ): Promise<void> {
    const db = getDatabase();
    const now = Date.now();

    // Ensure record exists
    await db.execute(
      `INSERT INTO ${TABLE.WORD_MODE_STRENGTH}
         (wordId, deckId, exerciseType, strength, errorCount, reviewCount, lastReviewed)
       VALUES (?, ?, ?, 0.0, 0, 0, NULL)
       ON CONFLICT(wordId, deckId, exerciseType) DO NOTHING;`,
      [wordId, deckId, exerciseType],
    );

    if (isCorrect) {
      await db.execute(
        `UPDATE ${TABLE.WORD_MODE_STRENGTH}
         SET
           strength     = MIN(?, strength + ?),
           reviewCount  = reviewCount + 1,
           lastReviewed = ?
         WHERE wordId = ? AND deckId = ? AND exerciseType = ?;`,
        [STRENGTH_MAX, STRENGTH_GAIN, now, wordId, deckId, exerciseType],
      );
    } else {
      await db.execute(
        `UPDATE ${TABLE.WORD_MODE_STRENGTH}
         SET
           strength     = MAX(?, strength - ?),
           errorCount   = errorCount + 1,
           reviewCount  = reviewCount + 1,
           lastReviewed = ?
         WHERE wordId = ? AND deckId = ? AND exerciseType = ?;`,
        [STRENGTH_MIN, STRENGTH_LOSS, now, wordId, deckId, exerciseType],
      );
    }
  }

  // Get strength for a single word in a specific mode
  async getStrength(
    wordId: number,
    deckId: number,
    exerciseType: ExerciseType,
  ): Promise<number> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT strength
       FROM ${TABLE.WORD_MODE_STRENGTH}
       WHERE wordId = ? AND deckId = ? AND exerciseType = ?;`,
      [wordId, deckId, exerciseType],
    );
    return (result.rows?.[0]?.strength as number) ?? 0.0;
  }

  // Get all weak words for a deck+mode (strength < threshold)
  async getWeakWords(
    deckId: number,
    exerciseType: ExerciseType,
    limit: number = 20,
  ): Promise<WeakWord[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT wordId, strength
       FROM ${TABLE.WORD_MODE_STRENGTH}
       WHERE deckId = ? AND exerciseType = ? AND strength < ?
       ORDER BY strength ASC, lastReviewed ASC
       LIMIT ?;`,
      [deckId, exerciseType, WEAK_THRESHOLD, limit],
    );
    return (result.rows ?? []).map(r => ({
      wordId: r.wordId as number,
      strength: r.strength as number,
    }));
  }

  // Get all strengths for a deck — used for prioritized word ordering
  async getAllForDeck(
    deckId: number,
    exerciseType: ExerciseType,
  ): Promise<Map<number, number>> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT wordId, strength
       FROM ${TABLE.WORD_MODE_STRENGTH}
       WHERE deckId = ? AND exerciseType = ?;`,
      [deckId, exerciseType],
    );
    const map = new Map<number, number>();
    for (const row of result.rows ?? []) {
      map.set(row.wordId as number, row.strength as number);
    }
    return map;
  }

  // Get words sorted by weakness for a deck+mode
  // Words without any record come first (never practiced = weakest)
  async getWordIdsSortedByWeakness(
    deckId: number,
    exerciseType: ExerciseType,
    limit: number = 20,
  ): Promise<number[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT
         dw.wordId,
         COALESCE(wms.strength, -1.0) AS strength
       FROM deck_words dw
       LEFT JOIN ${TABLE.WORD_MODE_STRENGTH} wms
         ON wms.wordId = dw.wordId
         AND wms.deckId = dw.deckId
         AND wms.exerciseType = ?
       WHERE dw.deckId = ?
       ORDER BY strength ASC, RANDOM()
       LIMIT ?;`,
      [exerciseType, deckId, limit],
    );
    return (result.rows ?? []).map(r => r.wordId as number);
  }

  // Summary — per-mode strength overview for a deck
  async getDeckModeSummary(
    deckId: number,
  ): Promise<Record<ExerciseType, { avgStrength: number; weakCount: number }>> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT
         exerciseType,
         AVG(strength)                          AS avgStrength,
         SUM(CASE WHEN strength < ? THEN 1 ELSE 0 END) AS weakCount
       FROM ${TABLE.WORD_MODE_STRENGTH}
       WHERE deckId = ?
       GROUP BY exerciseType;`,
      [WEAK_THRESHOLD, deckId],
    );

    const summary: Partial<
      Record<ExerciseType, { avgStrength: number; weakCount: number }>
    > = {};
    for (const row of result.rows ?? []) {
      summary[row.exerciseType as ExerciseType] = {
        avgStrength: row.avgStrength as number,
        weakCount: row.weakCount as number,
      };
    }
    return summary as Record<
      ExerciseType,
      { avgStrength: number; weakCount: number }
    >;
  }
}

export const wordModeStrengthRepository = new WordModeStrengthRepository();
