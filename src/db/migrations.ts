import { DB } from './types';

export interface Migration {
  version: number;
  up: (db: DB) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      // Deck groups (categories)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS deck_groups (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          title     TEXT    NOT NULL,
          icon      TEXT    NOT NULL,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL
        );
      `);

      // Words
      await db.execute(`
        CREATE TABLE IF NOT EXISTS words (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          word         TEXT    NOT NULL,
          languageCode TEXT    NOT NULL DEFAULT 'no',
          partOfSpeech TEXT    NOT NULL DEFAULT 'noun',
          gender       TEXT,
          level        TEXT,
          ordbokenUrl  TEXT,
          imageUrl     TEXT,
          createdAt    INTEGER NOT NULL
        );
      `);

      // Word forms (plural, verb forms, etc.)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS word_forms (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          wordId   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          formType TEXT    NOT NULL,
          form     TEXT    NOT NULL,
          UNIQUE (wordId, formType)
        );
      `);

      // Translations
      await db.execute(`
        CREATE TABLE IF NOT EXISTS translations (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          wordId       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          languageCode TEXT    NOT NULL,
          translation  TEXT    NOT NULL,
          UNIQUE (wordId, languageCode)
        );
      `);

      // Decks
      await db.execute(`
        CREATE TABLE IF NOT EXISTS decks (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          groupId      INTEGER REFERENCES deck_groups(id) ON DELETE SET NULL,
          title        TEXT    NOT NULL,
          icon         TEXT    NOT NULL,
          languageCode TEXT    NOT NULL DEFAULT 'no',
          level        TEXT,
          sortOrder    INTEGER NOT NULL DEFAULT 0,
          createdAt    INTEGER NOT NULL
        );
      `);

      // Many-to-many: word ↔ deck
      await db.execute(`
        CREATE TABLE IF NOT EXISTS deck_words (
          deckId  INTEGER NOT NULL REFERENCES decks(id)  ON DELETE CASCADE,
          wordId  INTEGER NOT NULL REFERENCES words(id)  ON DELETE CASCADE,
          PRIMARY KEY (deckId, wordId)
        );
      `);

      // Progress per word per deck
      await db.execute(`
        CREATE TABLE IF NOT EXISTS word_progress (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          wordId  INTEGER NOT NULL REFERENCES words(id)  ON DELETE CASCADE,
          deckId  INTEGER NOT NULL REFERENCES decks(id)  ON DELETE CASCADE,
          status  TEXT    NOT NULL DEFAULT 'new',
          UNIQUE (wordId, deckId)
        );
      `);

      // User settings per deck
      await db.execute(`
        CREATE TABLE IF NOT EXISTS deck_user_settings (
          deckId      INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
          isFavorite  INTEGER NOT NULL DEFAULT 0,
          status      TEXT    NOT NULL DEFAULT 'new',
          startedAt   INTEGER,
          completedAt INTEGER
        );
      `);
    },
  },
];