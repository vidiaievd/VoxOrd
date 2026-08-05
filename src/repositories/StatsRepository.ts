import { getDatabase } from '../db/database';
import { SQL } from '../srs/dueness';

export interface GlobalStats {
  totalDecks: number;
  totalWords: number;
  learnedWords: number;
  repeatWords: number;
}

class StatsRepository {
  async getGlobalStats(): Promise<GlobalStats> {
    const db = getDatabase();

    // Same move as DeckRepository (plan Step 9.5): counted from the FSRS card
    // rather than the retired `status` column, so `repeatWords` now means
    // "due now".
    const wordsResult = await db.execute(`
      SELECT
        COUNT(*)                                        AS total,
        SUM(CASE WHEN ${SQL.isLearned('word_progress')} THEN 1 ELSE 0 END) AS learned,
        SUM(CASE WHEN ${SQL.isDue('word_progress')}     THEN 1 ELSE 0 END) AS repeat
      FROM word_progress;
    `, [Date.now()]);

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
