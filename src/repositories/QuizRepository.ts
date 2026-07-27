import { getDatabase }  from '../db/database';
import { TABLE }        from '../db/types';
import { QuizQuestion } from '../hooks/useQuiz';

const QUESTION_COUNT = 7;
const OPTIONS_COUNT  = 4;

class QuizRepository {
  async getQuestionsForDeck(
    deckId:           number,
    uiLang:           string   = 'ru',
    overrideWordIds?: number[],
  ): Promise<QuizQuestion[]> {
    const db = getDatabase();

    // NOTE: this must land in a real WHERE clause. It used to be interpolated
    // directly after the LEFT JOIN's ON condition, which made it part of that
    // condition — and a LEFT JOIN's ON never filters the left table, so the
    // override silently had no effect and the exercise drilled arbitrary deck
    // words. The `WHERE 1 = 1` below exists so this can always be appended.
    const wordFilter = overrideWordIds && overrideWordIds.length > 0
      ? `AND w.id IN (${overrideWordIds.join(',')})`
      : '';

    const limit = overrideWordIds?.length ?? QUESTION_COUNT;

    const poolResult = await db.execute(
      `SELECT DISTINCT
         w.id     AS wordId,
         w.word,
         t.translation,
         COALESCE(wms.strength, -1.0) AS strength
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.DECK_WORDS}   dw  ON dw.wordId = w.id AND dw.deckId = ?
       JOIN ${TABLE.TRANSLATIONS} t   ON t.wordId  = w.id AND t.languageCode = ?
       LEFT JOIN ${TABLE.WORD_MODE_STRENGTH} wms
         ON wms.wordId = w.id AND wms.deckId = ? AND wms.exerciseType = 'quiz'
       WHERE 1 = 1
       ${wordFilter}
       ORDER BY strength ASC, RANDOM()
       LIMIT ?;`,
      [deckId, uiLang, deckId, limit],
    );

    const pool = (poolResult.rows ?? []).map(row => ({
      wordId:      row.wordId      as number,
      word:        row.word        as string,
      translation: row.translation as string,
    }));

    if (pool.length < OPTIONS_COUNT) return [];

    // Load full deck pool for distractors — needed even when overrideWordIds is set
    const distractorPool = overrideWordIds
      ? await this.loadDistractorPool(deckId, uiLang, overrideWordIds)
      : pool;

    return pool.map(target => {
      const distractors = distractorPool
        .filter(p => p.wordId !== target.wordId)
        .sort(() => Math.random() - 0.5)
        .slice(0, OPTIONS_COUNT - 1)
        .map(p => p.translation);

      // If not enough distractors — fill from pool itself
      const allDistractors = distractors.length >= OPTIONS_COUNT - 1
        ? distractors
        : [
            ...distractors,
            ...pool
              .filter(p => p.wordId !== target.wordId && !distractors.includes(p.translation))
              .map(p => p.translation),
          ].slice(0, OPTIONS_COUNT - 1);

      const options = [target.translation, ...allDistractors].sort(
        () => Math.random() - 0.5,
      );

      return {
        wordId:        target.wordId,
        word:          target.word,
        correctAnswer: target.translation,
        options,
      };
    });
  }

  // Load full deck word pool for use as distractors
  private async loadDistractorPool(
    deckId: number,
    uiLang: string,
    excludeWordIds: number[],
  ): Promise<{ wordId: number; translation: string }[]> {
    const db = getDatabase();

    const result = await db.execute(
      `SELECT DISTINCT
         w.id          AS wordId,
         t.translation
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
       JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
       ORDER BY RANDOM();`,
      [deckId, uiLang],
    );

    return (result.rows ?? []).map(row => ({
      wordId:      row.wordId      as number,
      translation: row.translation as string,
    }));
  }
}

export const quizRepository = new QuizRepository();