import { DB } from './types';

const WORDS = [
  { word: 'ephemeral',  translation: 'кратковременный' },
  { word: 'ubiquitous', translation: 'вездесущий' },
  { word: 'paradigm',   translation: 'парадигма' },
  { word: 'resilient',  translation: 'устойчивый' },
  { word: 'verbose',    translation: 'многословный' },
  { word: 'iterate',    translation: 'итерировать' },
  { word: 'abstract',   translation: 'абстрактный' },
  { word: 'leverage',   translation: 'использовать с выгодой' },
];

export async function seedIfEmpty(db: DB): Promise<void> {
  const result = await db.execute('SELECT COUNT(*) as count FROM words;');
  const count = (result.rows?.[0]?.count as number) ?? 0 ;

  if (count > 0) {
    console.log('[DB] Seed skipped, data exists');
    return;
  }

  const now = Date.now();
  for (const { word, translation } of WORDS) {
    await db.execute(
      'INSERT INTO words (word, translation, status, createdAt) VALUES (?, ?, ?, ?);',
      [word, translation, 'new', now]
    );
  }
  console.log(`[DB] Seeded ${WORDS.length} words`);
}