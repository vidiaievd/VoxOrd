import { getDatabase } from '../db/database';

export interface GlobalStats {
  totalDecks: number;
  totalWords: number;
  learnedWords: number;
  repeatWords: number;
}

class StatsRepository {
  async getGlobalStats(): Promise<GlobalStats> {
    const db = getDatabase();

    const wordsResult = await db.execute(`
      SELECT
        COUNT(*)                                             AS total,
        SUM(CASE WHEN status = 'learned' THEN 1 ELSE 0 END) AS learned,
        SUM(CASE WHEN status = 'repeat'  THEN 1 ELSE 0 END) AS repeat
      FROM word_progress;
    `);

    const decksResult = await db.execute(
      'SELECT COUNT(*) AS total FROM decks;',
    );

    const row = wordsResult.rows?.[0];

    return {
      totalDecks: (decksResult.rows?.[0]?.total as number) ?? 0,
      totalWords: (row?.total as number) ?? 0,
      learnedWords: (row?.learned as number) ?? 0,
      repeatWords: (row?.repeat as number) ?? 0,
    };
  }
}

export const statsRepository = new StatsRepository();
