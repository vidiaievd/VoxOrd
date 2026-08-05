import { getDatabase } from './database';
import { TABLE } from './types';
import { readCard } from '../srs/cardRow';
import { bucketOf, SQL, type ProgressBucket } from '../srs/dueness';

/**
 * The `word_progress.status` column. Nothing reads it for scheduling any more
 * (Step 9.5 moved every count onto the FSRS card), but the column still exists
 * and the row type still describes it until the migration that drops it.
 */
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
  // scheduling, from the FSRS card (plan Step 9.5)
  bucket: ProgressBucket;
  /** Epoch ms the card comes due, or null when it was never introduced. */
  dueAt: number | null;
  reviewCount: number;
}

/**
 * The next word to show in a flashcard session.
 *
 * `excludeIds` is a *set*, not a single id, and that matters since Step 9.5:
 * the schedule is now written once at session end, so a word answered earlier
 * in the same sitting is still due and would otherwise come round again and
 * again. The retired per-answer write used to push it into the future
 * immediately, which hid the need for this.
 */
export async function getNextWord(
  deckId: number,
  excludeIds: readonly number[] = [],
  uiLang: string = 'ru',
): Promise<Word | null> {
  const db = getDatabase();
  const now = Date.now();
  const placeholders = excludeIds.map(() => '?').join(', ');

  // Never-introduced words and due cards both qualify; a card scheduled into
  // the future does not. New words come first, then the most overdue — the
  // same shape as the retired ordering (lowest stage first, then least
  // reviewed), now expressed in the card's own terms.
  const result = await db.execute(
    `SELECT
       w.id, w.word, w.partOfSpeech, w.gender, w.ordbokenUrl, w.imageUrl,
       t.translation,
       wp.status,
       wp.reviewCount,
       wp.fsrsState, wp.fsrsStability, wp.fsrsDifficulty, wp.fsrsDueAt,
       wp.fsrsReps, wp.fsrsLapses, wp.fsrsElapsedDays, wp.fsrsScheduledDays,
       wp.fsrsLearningSteps, wp.fsrsLastReviewedAt, wp.fsrsProfileId
     FROM ${TABLE.WORDS} w
     JOIN ${TABLE.DECK_WORDS}    dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS}  t  ON t.wordId  = w.id AND t.languageCode = ?
     LEFT JOIN ${TABLE.WORD_PROGRESS} wp
       ON wp.wordId = w.id AND wp.deckId = ?
     WHERE ${excludeIds.length > 0 ? `w.id NOT IN (${placeholders})` : '1 = 1'}
       AND (wp.wordId IS NULL OR ${SQL.isNew('wp')} OR ${SQL.isDue('wp')})
     ORDER BY
       CASE WHEN wp.wordId IS NULL OR ${SQL.isNew('wp')} THEN 0 ELSE 1 END ASC,
       wp.fsrsDueAt ASC,
       COALESCE(wp.reviewCount, 0) ASC
     LIMIT 1;`,
    [deckId, uiLang, deckId, ...excludeIds, now],
  );

  const row = result.rows?.[0];
  if (!row) return null;

  const card = readCard(row);

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
    bucket: bucketOf(card),
    dueAt: card?.dueAt ?? null,
    reviewCount: (row.reviewCount ?? 0) as number,
  };
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
