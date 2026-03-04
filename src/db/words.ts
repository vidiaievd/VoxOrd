import { getDatabase } from './database';

export type WordStatus = 'new' | 'learned' | 'repeat';

export interface Word {
  id: number;
  word: string;
  translation: string;
  status: WordStatus;
  createdAt: number;
}

export async function getNextWord(excludeId?: number): Promise<Word | null> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT * FROM words
     WHERE id != ?
     ORDER BY
       CASE status
         WHEN 'new'    THEN 1
         WHEN 'repeat' THEN 2
         WHEN 'learned' THEN 3
       END,
       createdAt ASC
     LIMIT 1;`,
    [excludeId ?? -1]
  );

  const row = result.rows?.[0];
  if (!row) return null;

  return {
    id: row.id as number,
    word: row.word as string,
    translation: row.translation as string,
    status: row.status as WordStatus,
    createdAt: row.createdAt as number,
  };
}

export async function updateWordStatus(
  id: number,
  status: WordStatus
): Promise<void> {
  const db = getDatabase();
  await db.execute(
    'UPDATE words SET status = ? WHERE id = ?;',
    [status, id]
  );
}