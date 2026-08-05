import { getDatabase }  from '../db/database';
import { TABLE }        from '../db/types';
import { QuizQuestion } from '../hooks/useQuiz';

const QUESTION_COUNT = 7;
const OPTIONS_COUNT  = 4;
/**
 * A question needs the answer plus at least one distractor to be answerable.
 * Anything below that is not a question, so such a word is dropped instead.
 */
const MIN_OPTIONS_COUNT = 2;
/** Upper bound on the dictionary-wide top-up query — a few spares are enough. */
const GLOBAL_DISTRACTOR_LIMIT = 30;

interface PoolEntry {
  wordId:      number;
  translation: string;
}

const shuffled = <T>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);

/**
 * Builds one question's options, or `null` when the dictionary cannot supply a
 * single usable distractor.
 *
 * Translations equal to the answer are skipped rather than counted: pulling
 * distractors from outside the deck makes a synonym collision plausible, and
 * two correct-looking options is worse than one fewer option.
 */
function pickOptions(
  target:         { wordId: number; translation: string },
  distractorPool: PoolEntry[],
): string[] | null {
  const seen        = new Set([target.translation]);
  const distractors: string[] = [];

  for (const candidate of shuffled(distractorPool)) {
    if (candidate.wordId === target.wordId) continue;
    if (seen.has(candidate.translation))    continue;
    seen.add(candidate.translation);
    distractors.push(candidate.translation);
    if (distractors.length === OPTIONS_COUNT - 1) break;
  }

  if (distractors.length < MIN_OPTIONS_COUNT - 1) return null;

  return shuffled([target.translation, ...distractors]);
}

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

    if (pool.length === 0) return [];

    // Distractors come from the deck first, so the options stay topical. A deck
    // too small to fill four options used to bail out with an empty question
    // list — the exercise then opened and closed instantly, with nothing telling
    // the user a phase had been skipped. Two-word personal sets became a routine
    // case once Deep Session started running on them, so the rest of the user's
    // dictionary now tops the deck up instead.
    const deckPool = overrideWordIds
      ? await this.loadDistractorPool(deckId, uiLang)
      : pool;

    const distractorPool = deckPool.length >= OPTIONS_COUNT
      ? deckPool
      : [
          ...deckPool,
          ...await this.loadGlobalDistractors(uiLang, deckPool.map(p => p.wordId)),
        ];

    const questions: QuizQuestion[] = [];

    for (const target of pool) {
      const options = pickOptions(target, distractorPool);
      // Only reachable when the whole dictionary holds no other translation —
      // a one-word install. Dropping the word keeps every returned question
      // answerable.
      if (!options) continue;

      questions.push({
        wordId:        target.wordId,
        word:          target.word,
        correctAnswer: target.translation,
        options,
      });
    }

    return questions;
  }

  // Load full deck word pool for use as distractors
  private async loadDistractorPool(
    deckId: number,
    uiLang: string,
  ): Promise<PoolEntry[]> {
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

  /**
   * Distractors from anywhere in the user's dictionary, for decks too small to
   * supply their own. Off-topic options make a question easier than a topical
   * set would, which is the price of the exercise running at all.
   */
  private async loadGlobalDistractors(
    uiLang:         string,
    excludeWordIds: number[],
  ): Promise<PoolEntry[]> {
    const db = getDatabase();

    const exclusion = excludeWordIds.length > 0
      ? `AND w.id NOT IN (${excludeWordIds.join(',')})`
      : '';

    const result = await db.execute(
      `SELECT DISTINCT
         w.id          AS wordId,
         t.translation
       FROM ${TABLE.WORDS}        w
       JOIN ${TABLE.TRANSLATIONS} t ON t.wordId = w.id AND t.languageCode = ?
       WHERE 1 = 1
       ${exclusion}
       ORDER BY RANDOM()
       LIMIT ?;`,
      [uiLang, GLOBAL_DISTRACTOR_LIMIT],
    );

    return (result.rows ?? []).map(row => ({
      wordId:      row.wordId      as number,
      translation: row.translation as string,
    }));
  }
}

export const quizRepository = new QuizRepository();