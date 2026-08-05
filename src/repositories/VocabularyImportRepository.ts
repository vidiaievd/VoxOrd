import { getDatabase } from '../db/database';
import type { DB } from '../db/types';
import type { ImportPlan, PlannedWord } from './vocabularyImportMapping';

/**
 * Imports a platform vocabulary list into a local deck — the only place course
 * code writes into the offline word database.
 *
 * Data-safety contract (decided with the user, 2026-07-25):
 *  - The importer never reads, updates or deletes a row that lacks a platform
 *    id. A personal word with the same lemma as a course word is a different
 *    row and is left untouched; duplicate lemmas across decks are accepted.
 *    `word_progress` is already keyed by (wordId, deckId), so learning is
 *    unaffected by the duplication.
 *  - Idempotent: the deck is keyed by `platformListId` and each word by
 *    `platformItemId` (both partial-unique since migration 8), so re-importing
 *    updates in place instead of duplicating.
 *  - Words dropped from the list upstream are unlinked from the deck and their
 *    (course-owned) row deleted. Only rows carrying a `platformItemId` are ever
 *    eligible for deletion.
 *  - `PRAGMA foreign_keys` is not enabled in this app, so ON DELETE CASCADE
 *    does not fire — every child row is deleted explicitly.
 *  - Every `deck_words` link gets a matching `word_progress` row, the way
 *    `seed.ts` does: `ProgressRepository.recordAnswer` silently no-ops when the
 *    row is missing, which would make imported words unlearnable.
 */

export interface ImportResult {
  deckId: number;
  deckTitle: string;
  imported: number;
  updated: number;
  removed: number;
  skippedNoTranslation: number;
}

const COURSES_GROUP_KEY = 'courses';
const COURSES_GROUP_ICON = '🎓';
const COURSE_DECK_ICON = '🎓';

export interface ImportOptions {
  /**
   * Title for the deck group imported lists land in. Group titles are stored
   * strings (the seeded ones are literals too), so the caller passes the
   * localized text at creation time; it is not rewritten afterwards.
   */
  coursesGroupTitle: string;
}

class VocabularyImportRepository {
  async importList(plan: ImportPlan, options: ImportOptions): Promise<ImportResult> {
    const db = getDatabase();

    const groupId = await this.ensureCoursesGroup(db, options.coursesGroupTitle);
    const deckId = await this.upsertDeck(db, plan, groupId);

    const existing = await this.loadExistingWords(db, deckId);
    const seen = new Set<string>();
    let imported = 0;
    let updated = 0;

    for (const word of plan.words) {
      const existingId = existing.get(word.platformItemId);
      seen.add(word.platformItemId);
      if (existingId === undefined) {
        await this.insertWord(db, deckId, word);
        imported += 1;
      } else {
        await this.updateWord(db, deckId, existingId, word);
        updated += 1;
      }
    }

    let removed = 0;
    for (const [platformItemId, wordId] of existing) {
      if (seen.has(platformItemId)) continue;
      await this.deleteCourseWord(db, deckId, wordId);
      removed += 1;
    }

    return {
      deckId,
      deckTitle: plan.deckTitle,
      imported,
      updated,
      removed,
      skippedNoTranslation: plan.skippedNoTranslation,
    };
  }

  /** The deck backing a platform list, or null when it was never imported. */
  async findDeckIdForList(platformListId: string): Promise<number | null> {
    const db = getDatabase();
    const result = await db.execute(
      'SELECT id FROM decks WHERE platformListId = ? LIMIT 1;',
      [platformListId],
    );
    const id = result.rows?.[0]?.id;
    return typeof id === 'number' ? id : null;
  }

  private async ensureCoursesGroup(db: DB, title: string): Promise<number> {
    const existing = await db.execute(
      'SELECT id FROM deck_groups WHERE systemKey = ? LIMIT 1;',
      [COURSES_GROUP_KEY],
    );
    const existingId = existing.rows?.[0]?.id;
    if (typeof existingId === 'number') return existingId;

    // Sorted after every user group so an import never reshuffles the home
    // screen the user is used to.
    const maxOrder = await db.execute(
      'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM deck_groups;',
    );
    const sortOrder = ((maxOrder.rows?.[0]?.maxOrder as number) ?? -1) + 1;

    await db.execute(
      `INSERT INTO deck_groups (title, icon, sortOrder, createdAt, systemKey)
       VALUES (?, ?, ?, ?, ?);`,
      [title, COURSES_GROUP_ICON, sortOrder, Date.now(), COURSES_GROUP_KEY],
    );
    return this.lastInsertId(db);
  }

  private async upsertDeck(db: DB, plan: ImportPlan, groupId: number): Promise<number> {
    const existingId = await this.findDeckIdForList(plan.platformListId);
    if (existingId !== null) {
      await db.execute(
        'UPDATE decks SET title = ?, languageCode = ?, level = ? WHERE id = ?;',
        [plan.deckTitle, plan.deckLanguageCode, plan.deckLevel, existingId],
      );
      return existingId;
    }

    const maxOrder = await db.execute(
      'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM decks WHERE groupId = ?;',
      [groupId],
    );
    const sortOrder = ((maxOrder.rows?.[0]?.maxOrder as number) ?? -1) + 1;

    await db.execute(
      `INSERT INTO decks
         (groupId, title, icon, languageCode, level, sortOrder, createdAt, platformListId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        groupId,
        plan.deckTitle,
        COURSE_DECK_ICON,
        plan.deckLanguageCode,
        plan.deckLevel,
        sortOrder,
        Date.now(),
        plan.platformListId,
      ],
    );
    const deckId = await this.lastInsertId(db);

    // Every deck needs its settings row; the rest of the app assumes one.
    await db.execute(
      `INSERT INTO deck_user_settings (deckId, isFavorite, status)
       VALUES (?, 0, 'new');`,
      [deckId],
    );
    return deckId;
  }

  /** platformItemId → local word id, for the course words already in this deck. */
  private async loadExistingWords(db: DB, deckId: number): Promise<Map<string, number>> {
    const result = await db.execute(
      `SELECT w.id, w.platformItemId
         FROM words w
         JOIN deck_words dw ON dw.wordId = w.id
        WHERE dw.deckId = ? AND w.platformItemId IS NOT NULL;`,
      [deckId],
    );
    const map = new Map<string, number>();
    for (const row of result.rows ?? []) {
      map.set(row.platformItemId as string, row.id as number);
    }
    return map;
  }

  private async insertWord(db: DB, deckId: number, word: PlannedWord): Promise<void> {
    await db.execute(
      `INSERT INTO words
         (word, languageCode, partOfSpeech, gender, level, ordbokenUrl, imageUrl, createdAt, platformItemId)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?);`,
      [
        word.word,
        word.languageCode,
        word.partOfSpeech,
        word.gender,
        word.level,
        Date.now(),
        word.platformItemId,
      ],
    );
    const wordId = await this.lastInsertId(db);

    await this.writeChildRows(db, wordId, word);

    await db.execute('INSERT INTO deck_words (deckId, wordId) VALUES (?, ?);', [deckId, wordId]);
    await db.execute(
      "INSERT INTO word_progress (wordId, deckId, status) VALUES (?, ?, 'new');",
      [wordId, deckId],
    );
  }

  private async updateWord(
    db: DB,
    deckId: number,
    wordId: number,
    word: PlannedWord,
  ): Promise<void> {
    await db.execute(
      `UPDATE words
          SET word = ?, languageCode = ?, partOfSpeech = ?, gender = ?, level = ?
        WHERE id = ? AND platformItemId IS NOT NULL;`,
      [word.word, word.languageCode, word.partOfSpeech, word.gender, word.level, wordId],
    );

    // Content is authored upstream, so it is replaced wholesale rather than
    // merged. Learning state (word_progress, word_mode_strength) is deliberately
    // left alone — a re-import must not reset the user's progress.
    await db.execute('DELETE FROM word_forms WHERE wordId = ?;', [wordId]);
    await this.deleteExamples(db, wordId);
    await this.writeChildRows(db, wordId, word);

    // Repair links that a partially failed earlier import may have left behind.
    await db.execute('INSERT OR IGNORE INTO deck_words (deckId, wordId) VALUES (?, ?);', [
      deckId,
      wordId,
    ]);
    await db.execute(
      "INSERT OR IGNORE INTO word_progress (wordId, deckId, status) VALUES (?, ?, 'new');",
      [wordId, deckId],
    );
  }

  private async writeChildRows(db: DB, wordId: number, word: PlannedWord): Promise<void> {
    for (const translation of word.translations) {
      await db.execute(
        `INSERT OR REPLACE INTO translations (wordId, languageCode, translation)
         VALUES (?, ?, ?);`,
        [wordId, translation.languageCode, translation.translation],
      );
    }

    for (const form of word.forms) {
      await db.execute(
        'INSERT OR REPLACE INTO word_forms (wordId, formType, form) VALUES (?, ?, ?);',
        [wordId, form.formType, form.form],
      );
    }

    for (const example of word.examples) {
      await db.execute(
        `INSERT INTO word_examples (wordId, sentence, sentenceLanguage, createdAt)
         VALUES (?, ?, ?, ?);`,
        [wordId, example.sentence, example.sentenceLanguage, Date.now()],
      );
      const exampleId = await this.lastInsertId(db);
      for (const translation of example.translations) {
        await db.execute(
          `INSERT OR REPLACE INTO word_example_translations (exampleId, languageCode, translation)
           VALUES (?, ?, ?);`,
          [exampleId, translation.languageCode, translation.translation],
        );
      }
    }
  }

  private async deleteExamples(db: DB, wordId: number): Promise<void> {
    await db.execute(
      `DELETE FROM word_example_translations
        WHERE exampleId IN (SELECT id FROM word_examples WHERE wordId = ?);`,
      [wordId],
    );
    await db.execute('DELETE FROM word_examples WHERE wordId = ?;', [wordId]);
  }

  /**
   * Removes a word that upstream dropped from the list. The `platformItemId IS
   * NOT NULL` guard on the final DELETE is the hard stop that keeps this path
   * from ever reaching a personal word, even if a link table were inconsistent.
   */
  private async deleteCourseWord(db: DB, deckId: number, wordId: number): Promise<void> {
    await db.execute('DELETE FROM word_progress WHERE wordId = ? AND deckId = ?;', [
      wordId,
      deckId,
    ]);
    await db.execute('DELETE FROM word_mode_strength WHERE wordId = ? AND deckId = ?;', [
      wordId,
      deckId,
    ]);
    await db.execute('DELETE FROM deck_words WHERE wordId = ? AND deckId = ?;', [wordId, deckId]);

    // Only delete the word itself once it belongs to no deck at all.
    const links = await db.execute('SELECT COUNT(*) AS count FROM deck_words WHERE wordId = ?;', [
      wordId,
    ]);
    if (((links.rows?.[0]?.count as number) ?? 0) > 0) return;

    await db.execute('DELETE FROM word_forms WHERE wordId = ?;', [wordId]);
    await db.execute('DELETE FROM translations WHERE wordId = ?;', [wordId]);
    await db.execute('DELETE FROM word_relations WHERE wordId = ? OR relatedWordId = ?;', [
      wordId,
      wordId,
    ]);
    await this.deleteExamples(db, wordId);
    await db.execute('DELETE FROM words WHERE id = ? AND platformItemId IS NOT NULL;', [wordId]);
    // `session_results` also references wordId, but nothing in the app reads
    // that table yet, so its rows are left as-is rather than rewriting history.
  }

  private async lastInsertId(db: DB): Promise<number> {
    const result = await db.execute('SELECT last_insert_rowid() AS id;');
    return result.rows?.[0]?.id as number;
  }
}

export const vocabularyImportRepository = new VocabularyImportRepository();
