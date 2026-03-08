import { getDatabase } from '../db/database';
import { TABLE, WordExample, WordExampleTranslation } from '../db/types';

class WordExampleRepository {
  // Get examples with translation for the requested language
  async getForWord(
    wordId: number,
    uiLang: string = 'ru',
  ): Promise<(WordExample & { translation: string | null })[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT
         e.id, e.wordId, e.sentence, e.sentenceLanguage, e.createdAt,
         et.translation
       FROM ${TABLE.WORD_EXAMPLES} e
       LEFT JOIN ${TABLE.WORD_EXAMPLE_TRANSLATIONS} et
         ON et.exampleId = e.id AND et.languageCode = ?
       WHERE e.wordId = ?
       ORDER BY e.id ASC;`,
      [uiLang, wordId],
    );

    return (result.rows ?? []).map(row => ({
      id: row.id as number,
      wordId: row.wordId as number,
      sentence: row.sentence as string,
      sentenceLanguage: row.sentenceLanguage as string,
      createdAt: row.createdAt as number,
      translation: row.translation as string | null,
    }));
  }

  // Get all translations for an example (for editing)
  async getTranslations(exampleId: number): Promise<WordExampleTranslation[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.WORD_EXAMPLE_TRANSLATIONS}
       WHERE exampleId = ?
       ORDER BY languageCode;`,
      [exampleId],
    );
    return (result.rows ?? []).map(row => ({
      id: row.id as number,
      exampleId: row.exampleId as number,
      languageCode: row.languageCode as string,
      translation: row.translation as string,
    }));
  }

  async addExample(
    wordId: number,
    sentence: string,
    sentenceLanguage: string = 'no',
  ): Promise<number> {
    const db = getDatabase();
    await db.execute(
      `INSERT INTO ${TABLE.WORD_EXAMPLES} (wordId, sentence, sentenceLanguage, createdAt)
       VALUES (?, ?, ?, ?);`,
      [wordId, sentence, sentenceLanguage, Date.now()],
    );
    const r = await db.execute('SELECT last_insert_rowid() as id;');
    return r.rows?.[0]?.id as number;
  }

  async addTranslation(
    exampleId: number,
    languageCode: string,
    translation: string,
  ): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `INSERT OR REPLACE INTO ${TABLE.WORD_EXAMPLE_TRANSLATIONS}
         (exampleId, languageCode, translation)
       VALUES (?, ?, ?);`,
      [exampleId, languageCode, translation],
    );
  }
}

export const wordExampleRepository = new WordExampleRepository();
