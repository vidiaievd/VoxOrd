import {
  getNextWord,
  updateWordStatus,
  Word,
  WordStatus,
} from '../db/words';

export interface ProgressStats {
  learned: number;
  repeat: number;
  new: number;
}

class WordRepository {
  // Get the next word with priority: new → repeat → learned
  async getNext(excludeId?: number): Promise<Word | null> {
    return getNextWord(excludeId);
  }

  // User flipped a card, mark 'new' as 'repeat'
  async markAsSeen(word: Word): Promise<Word> {
    if (word.status !== 'new') return word;
    await updateWordStatus(word.id, 'repeat');
    console.log(`[Progress] ${word.word}: new → repeat`);
    return { ...word, status: 'repeat' };
  }

  // Apply swipe result
  async markAsLearned(word: Word): Promise<void> {
    await updateWordStatus(word.id, 'learned');
    console.log(`[Progress] ${word.word}: ${word.status} → learned`);
  }

  // Apply swipe result
  async markAsRepeat(word: Word): Promise<void> {
    await updateWordStatus(word.id, 'repeat');
    console.log(`[Progress] ${word.word}: ${word.status} → repeat`);
  }

  // Apply swipe result
  async applySwipeResult(word: Word, status: WordStatus): Promise<void> {
    switch (status) {
      case 'learned':
        return this.markAsLearned(word);
      case 'repeat':
        return this.markAsRepeat(word);
      default:
        console.warn(`[Progress] Unknown status: ${status}`);
    }
  }

  // Statistics for progress screen
  async getStats(): Promise<ProgressStats> {
    const db = (await import('../db/database')).getDatabase();
    const result = await db.execute(`
      SELECT status, COUNT(*) as count
      FROM words
      GROUP BY status;
    `);

    const stats: ProgressStats = { learned: 0, repeat: 0, new: 0 };
    const rows = result.rows ?? [];

    for (const row of rows) {
      const status = row.status as WordStatus;
      const count = row.count as number;
      if (status in stats) {
        stats[status] = count;
      }
    }

    return stats;
  }
}

// Singleton
export const wordRepository = new WordRepository();