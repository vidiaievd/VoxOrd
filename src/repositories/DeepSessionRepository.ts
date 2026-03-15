import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { DeepSessionWord } from '../hooks/useDeepSession';

class DeepSessionRepository {
  async loadWordsForDeck(
    deckId: number,
    uiLang: string = 'ru',
  ): Promise<DeepSessionWord[]> {
    const db = getDatabase();

    const result = await db.execute(
      `SELECT
         w.id          AS wordId,
         w.word,
         t.translation
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
       JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
       ORDER BY RANDOM()
       LIMIT 20;`,
      [deckId, uiLang],
    );

    return (result.rows ?? []).map(r => ({
      wordId: r.wordId as number,
      word: r.word as string,
      translation: r.translation as string,
    }));
  }

  async loadWordsByIds(
    wordIds: number[],
    uiLang: string = 'ru',
  ): Promise<DeepSessionWord[]> {
    if (wordIds.length === 0) return [];

    const db = getDatabase();

    const result = await db.execute(
      `SELECT
         w.id          AS wordId,
         w.word,
         t.translation
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.TRANSLATIONS} t ON t.wordId = w.id AND t.languageCode = ?
       WHERE w.id IN (${wordIds.join(',')})
       ORDER BY RANDOM();`,
      [uiLang],
    );

    return (result.rows ?? []).map(r => ({
      wordId: r.wordId as number,
      word: r.word as string,
      translation: r.translation as string,
    }));
  }
}

export const deepSessionRepository = new DeepSessionRepository();
