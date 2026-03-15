import { getDatabase } from './database';
import {
  TABLE,
  MemoryStage,
} from './types';

export type WordStatus = 'new' | 'learned' | 'repeat';

export interface Word {
  id: number;
  word: string;
  translation: string;
  status: 'new' | 'repeat' | 'learned';
  deckId: number;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';
  gender: 'masculine' | 'feminine' | 'neuter' | null;
  ordbokenUrl: string | null;
  imageUrl: string | null;
  forms: { formType: string; form: string }[];
  // spaced repetition fields
  memoryStage: MemoryStage;
  nextReview: number | null;
  reviewCount: number;
}

export async function getNextWord(
  deckId: number,
  excludeId: number | null,
  uiLang: string = 'ru',
): Promise<Word | null> {
  const db = getDatabase();
  const now = Date.now();

  const result = await db.execute(
    `SELECT
       w.id, w.word, w.partOfSpeech, w.gender, w.ordbokenUrl, w.imageUrl,
       t.translation,
       wp.status,
       wp.memoryStage,
       wp.nextReview,
       wp.reviewCount
     FROM ${TABLE.WORDS} w
     JOIN ${TABLE.DECK_WORDS}    dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS}  t  ON t.wordId  = w.id AND t.languageCode = ?
     LEFT JOIN ${TABLE.WORD_PROGRESS} wp
       ON wp.wordId = w.id AND wp.deckId = ?
     WHERE w.id != ?
       AND (wp.nextReview IS NULL OR wp.nextReview <= ?)
     ORDER BY
       COALESCE(wp.memoryStage, 0) ASC,
       COALESCE(wp.reviewCount, 0) ASC
     LIMIT 1;`,
    [deckId, uiLang, deckId, excludeId ?? -1, now],
  );

  const row = result.rows?.[0];
  if (!row) return null;

  // Load word forms
  const formsResult = await db.execute(
    `SELECT formType, form FROM ${TABLE.WORD_FORMS} WHERE wordId = ?;`,
    [row.id as number],
  );

  return {
    id: row.id as number,
    word: row.word as string,
    translation: row.translation as string,
    status: (row.status ?? 'new') as Word['status'],
    deckId,
    partOfSpeech: row.partOfSpeech as Word['partOfSpeech'],
    gender: row.gender as Word['gender'],
    ordbokenUrl: row.ordbokenUrl as string | null,
    imageUrl: row.imageUrl as string | null,
    forms: (formsResult.rows ?? []).map(f => ({
      formType: f.formType as string,
      form: f.form as string,
    })),
    memoryStage: (row.memoryStage ?? 0) as MemoryStage,
    nextReview: row.nextReview as number | null,
    reviewCount: (row.reviewCount ?? 0) as number,
  };
}

// @deprecated — use progressRepository.recordAnswer
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
