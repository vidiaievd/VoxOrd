import { getDatabase } from './database';
import {
  UI_LANGUAGE,
  WordForm,
  FormType,
  PartOfSpeech,
  NounGender,
} from './types';

export type WordStatus = 'new' | 'learned' | 'repeat';

export interface Word {
  id: number;
  word: string;
  translation: string;
  status: WordStatus;
  deckId: number;
  partOfSpeech: PartOfSpeech;
  gender: NounGender;
  ordbokenUrl: string | null;
  imageUrl: string | null;
  forms: WordForm[];
}

export async function getNextWord(
  deckId: number,
  excludeId?: number,
): Promise<Word | null> {
  const db = getDatabase();

  // Basic data of the word
  const result = await db.execute(
    `SELECT
       w.id,
       w.word,
       w.partOfSpeech,
       w.gender,
       w.ordbokenUrl,
       w.imageUrl,
       t.translation,
       wp.status,
       wp.deckId
     FROM word_progress wp
     JOIN words        w  ON w.id     = wp.wordId
     JOIN translations t  ON t.wordId = w.id AND t.languageCode = ?
     WHERE wp.deckId = ?
       AND wp.wordId != ?
     ORDER BY
       CASE wp.status
         WHEN 'new'     THEN 1
         WHEN 'repeat'  THEN 2
         WHEN 'learned' THEN 3
       END,
       w.createdAt ASC
     LIMIT 1;`,
    [UI_LANGUAGE, deckId, excludeId ?? -1],
  );

  const row = result.rows?.[0];
  if (!row) return null;

  // Word forms
  const formsResult = await db.execute(
    'SELECT formType, form FROM word_forms WHERE wordId = ? ORDER BY id;',
    [row.id as number],
  );

  const forms: WordForm[] = (formsResult.rows ?? []).map(f => ({
    formType: f.formType as FormType,
    form: f.form as string,
  }));

  return {
    id: row.id as number,
    word: row.word as string,
    translation: row.translation as string,
    status: row.status as WordStatus,
    deckId: row.deckId as number,
    partOfSpeech: row.partOfSpeech as PartOfSpeech,
    gender: (row.gender as NounGender) ?? null,
    ordbokenUrl: (row.ordbokenUrl as string) ?? null,
    imageUrl: (row.imageUrl as string) ?? null,
    forms,
  };
}

export async function updateWordStatus(
  wordId: number,
  deckId: number,
  status: WordStatus,
): Promise<void> {
  const db = getDatabase();
  await db.execute(
    'UPDATE word_progress SET status = ? WHERE wordId = ? AND deckId = ?;',
    [status, wordId, deckId],
  );
}

export async function debugPrintAllWords(): Promise<void> {
  const db = getDatabase();
  const result = await db.execute(`
    SELECT w.id, w.word, w.partOfSpeech, t.translation, wp.status, wp.deckId
    FROM words w
    JOIN translations  t  ON t.wordId  = w.id AND t.languageCode = 'ru'
    JOIN word_progress wp ON wp.wordId = w.id
    ORDER BY w.id;
  `);
  const rows = result.rows ?? [];
  console.log(`[DB] Total word-deck pairs: ${rows.length}`);
  rows.forEach(row => {
    console.log(
      `[DB] #${row.id} | ${row.word} (${row.partOfSpeech}) → ${row.translation} | deck: ${row.deckId} | status: ${row.status}`,
    );
  });
}
