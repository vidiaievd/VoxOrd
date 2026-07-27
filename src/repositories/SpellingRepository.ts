import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { SpellingQuestion } from '../hooks/useSpelling';

const QUESTION_COUNT = 7;

/**
 * Phrases are excluded from the spelling drill.
 *
 * Typing a whole phrase letter-perfect is a memory test, not a spelling test:
 * seeded entries reach 31 characters (`Alle som er bosatt i Norge, ...`), and
 * with the grader's rule 3 a phrase that cannot realistically be typed would
 * reset its FSRS schedule every session. Phrases are still drilled in
 * quiz/listening, where recognition is the right measure. Decided with the
 * user, 2026-07-27.
 */
const EXCLUDED_PART_OF_SPEECH = 'phrase';

function buildHint(word: string): string {
  return word
    .split('')
    .map((char, index) => {
      if (index === 0) return char;
      if (char === ' ') return ' ';
      return '_';
    })
    .join('');
}

class SpellingRepository {
  async getQuestionsForDeck(
    deckId: number,
    uiLang: string = 'ru',
    overrideWordIds?: number[],
  ): Promise<SpellingQuestion[]> {
    const db = getDatabase();

    const wordFilter =
      overrideWordIds && overrideWordIds.length > 0
        ? `AND w.id IN (${overrideWordIds.join(',')})`
        : '';

    const limit = overrideWordIds?.length ?? QUESTION_COUNT;

    const result = await db.execute(
      `SELECT
         w.id     AS wordId,
         w.word,
         t.translation,
         COALESCE(wms.strength, -1.0) AS strength
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.DECK_WORDS}   dw  ON dw.wordId = w.id AND dw.deckId = ?
       JOIN ${TABLE.TRANSLATIONS} t   ON t.wordId  = w.id AND t.languageCode = ?
       LEFT JOIN word_mode_strength wms
         ON wms.wordId = w.id AND wms.deckId = ? AND wms.exerciseType = 'spelling'
       WHERE (w.partOfSpeech IS NULL OR w.partOfSpeech != ?)
       ${wordFilter}
       ORDER BY strength ASC, RANDOM()
       LIMIT ?;`,
      [deckId, uiLang, deckId, EXCLUDED_PART_OF_SPEECH, limit],
    );

    return (result.rows ?? []).map(row => ({
      wordId: row.wordId as number,
      word: row.word as string,
      translation: row.translation as string,
      hint: buildHint(row.word as string),
    }));
  }
}

export const spellingRepository = new SpellingRepository();
