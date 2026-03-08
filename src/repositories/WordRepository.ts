import { getNextWord, updateWordStatus, Word, WordStatus } from '../db/words';
import { getDatabase } from '../db/database';

export interface ProgressStats {
  learned: number;
  repeat: number;
  new: number;
}

class WordRepository {
  async getNext(deckId: number, excludeId?: number): Promise<Word | null> {
    return getNextWord(deckId, excludeId);
  }

  async markAsSeen(word: Word): Promise<Word> {
    if (word.status !== 'new') return word;
    await updateWordStatus(word.id, word.deckId, 'repeat');
    return { ...word, status: 'repeat' };
  }

  async applySwipeResult(word: Word, status: WordStatus): Promise<void> {
    await updateWordStatus(word.id, word.deckId, status);
    console.log(`[Progress] ${word.word}: ${word.status} → ${status}`);
  }

  async getStats(deckId: number): Promise<ProgressStats> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT status, COUNT(*) as count
       FROM word_progress
       WHERE deckId = ?
       GROUP BY status;`,
      [deckId],
    );

    const stats: ProgressStats = { learned: 0, repeat: 0, new: 0 };
    for (const row of result.rows ?? []) {
      const s = row.status as WordStatus;
      if (s in stats) stats[s] = row.count as number;
    }
    return stats;
  }
}

export const wordRepository = new WordRepository();
