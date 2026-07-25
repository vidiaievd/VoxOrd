import { DB } from './types';

export interface Migration {
  version: number;
  up: (db: DB) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async db => {
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
  {
    version: 2,
    up: async db => {
      // User profile
      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_profile (
          id        INTEGER PRIMARY KEY DEFAULT 1,
          name      TEXT    NOT NULL DEFAULT 'User',
          avatar    TEXT    NOT NULL DEFAULT '👤',
          createdAt INTEGER NOT NULL
        );
      `);

      // Daily statistics (for chart)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_stats (
          id              INTEGER PRIMARY KEY DEFAULT 1,
          xp              INTEGER NOT NULL DEFAULT 0,
          streak          INTEGER NOT NULL DEFAULT 0,
          longestStreak   INTEGER NOT NULL DEFAULT 0,
          lastActivityAt  INTEGER,
          totalWordsLearned INTEGER NOT NULL DEFAULT 0,
          totalSessions   INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Daily activity (for chart)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_activity (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          date      TEXT    NOT NULL UNIQUE,  -- 'YYYY-MM-DD'
          wordsStudied INTEGER NOT NULL DEFAULT 0,
          xpEarned  INTEGER NOT NULL DEFAULT 0,
          sessionsCount INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Daily goal
      await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_goal (
          id        INTEGER PRIMARY KEY DEFAULT 1,
          goal      INTEGER NOT NULL DEFAULT 20,
          updatedAt INTEGER NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    up: async db => {
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN memoryStage       INTEGER NOT NULL DEFAULT 0;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN nextReview        INTEGER;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN lastReviewed      INTEGER;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN reviewCount       INTEGER NOT NULL DEFAULT 0;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN successCount      INTEGER NOT NULL DEFAULT 0;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN shortTermStrength REAL NOT NULL DEFAULT 0.0;
    `);
      await db.execute(`
      ALTER TABLE word_progress
      ADD COLUMN longTermStrength  REAL NOT NULL DEFAULT 0.0;
    `);
    },
  },
  {
    version: 4,
    up: async db => {
      await db.execute(`
      CREATE TABLE IF NOT EXISTS learning_sessions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        deckId         INTEGER REFERENCES decks(id) ON DELETE SET NULL,
        sessionType    TEXT    NOT NULL,
        startedAt      INTEGER NOT NULL,
        finishedAt     INTEGER,
        totalWords     INTEGER NOT NULL DEFAULT 0,
        correctAnswers INTEGER NOT NULL DEFAULT 0,
        xpEarned       INTEGER NOT NULL DEFAULT 0
      );
    `);

      await db.execute(`
      CREATE TABLE IF NOT EXISTS session_results (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId      INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
        wordId         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        exerciseType   TEXT    NOT NULL,
        isCorrect      INTEGER NOT NULL DEFAULT 0,
        responseTimeMs INTEGER,
        answeredAt     INTEGER NOT NULL
      );
    `);
    },
  },
  {
    version: 5,
    up: async db => {
      await db.execute(`
      CREATE TABLE IF NOT EXISTS word_examples (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        wordId              INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        sentence            TEXT    NOT NULL,
        sentenceLanguage    TEXT    NOT NULL DEFAULT 'no',
        createdAt           INTEGER NOT NULL
      );
    `);
      await db.execute(`
      CREATE TABLE IF NOT EXISTS word_example_translations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        exampleId       INTEGER NOT NULL REFERENCES word_examples(id) ON DELETE CASCADE,
        languageCode    TEXT    NOT NULL,
        translation     TEXT    NOT NULL,
        UNIQUE (exampleId, languageCode)
      );
    `);
      await db.execute(`
      CREATE TABLE IF NOT EXISTS word_relations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        wordId        INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        relatedWordId INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        relationType  TEXT    NOT NULL,
        strength      REAL    NOT NULL DEFAULT 1.0,
        UNIQUE (wordId, relatedWordId, relationType)
      );
    `);
    },
  },
  {
    version: 6,
    up: async db => {
      // Add context_sentence column to word_examples
      // for sentences specifically designed for gap-fill exercises
      await db.execute(`
      ALTER TABLE word_examples
      ADD COLUMN isContextSentence INTEGER NOT NULL DEFAULT 0;
    `);
    },
  },
  {
    version: 7,
    up: async db => {
      await db.execute(`
      CREATE TABLE IF NOT EXISTS word_mode_strength (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        wordId       INTEGER NOT NULL REFERENCES words(id),
        deckId       INTEGER NOT NULL REFERENCES decks(id),
        exerciseType TEXT    NOT NULL,
        strength     REAL    NOT NULL DEFAULT 0.0,
        errorCount   INTEGER NOT NULL DEFAULT 0,
        reviewCount  INTEGER NOT NULL DEFAULT 0,
        lastReviewed INTEGER,
        UNIQUE(wordId, deckId, exerciseType)
      );
    `);
      await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wms_word_deck
        ON word_mode_strength(wordId, deckId);
    `);
      await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wms_strength
        ON word_mode_strength(deckId, exerciseType, strength);
    `);
    },
  },
  {
    version: 8,
    up: async db => {
      // Linkage columns for importing a platform vocabulary list into a local
      // deck (course-integration plan, Phase 5.2). They are the only thing
      // connecting course content to the offline word database: a row with a
      // NULL platform id is a personal row the importer never touches.
      //
      // The migration runner has no transaction around `up()`, and SQLite
      // rejects a duplicate ADD COLUMN, so each step checks first — a partially
      // applied v8 can be re-run safely.
      await addColumnIfMissing(db, 'decks', 'platformListId', 'TEXT');
      await addColumnIfMissing(db, 'words', 'platformItemId', 'TEXT');
      await addColumnIfMissing(db, 'deck_groups', 'systemKey', 'TEXT');

      // Partial unique indexes: one deck per platform list, one word row per
      // platform vocabulary item, one group per system key — while leaving the
      // many existing NULL rows unconstrained.
      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_platform_list
        ON decks(platformListId) WHERE platformListId IS NOT NULL;
    `);
      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_words_platform_item
        ON words(platformItemId) WHERE platformItemId IS NOT NULL;
    `);
      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_groups_system_key
        ON deck_groups(systemKey) WHERE systemKey IS NOT NULL;
    `);
    },
  },
  {
    version: 9,
    up: async db => {
      // Repair migration — intentionally repeats v8's DDL verbatim.
      //
      // Devices that launched an intermediate build during Step 5.2 recorded
      // v8 in schema_migrations while its body was still empty, so none of the
      // three linkage columns exist there. A recorded version never re-runs,
      // which left those installs permanently broken ("no such column:
      // systemKey" on the first vocabulary import). Repeating the DDL under a
      // new version is the only way to reach them.
      //
      // Every statement is idempotent, so this is a no-op on installs where v8
      // applied correctly.
      await addColumnIfMissing(db, 'decks', 'platformListId', 'TEXT');
      await addColumnIfMissing(db, 'words', 'platformItemId', 'TEXT');
      await addColumnIfMissing(db, 'deck_groups', 'systemKey', 'TEXT');

      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_platform_list
        ON decks(platformListId) WHERE platformListId IS NOT NULL;
    `);
      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_words_platform_item
        ON words(platformItemId) WHERE platformItemId IS NOT NULL;
    `);
      await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_groups_system_key
        ON deck_groups(systemKey) WHERE systemKey IS NOT NULL;
    `);
    },
  },
];

async function addColumnIfMissing(
  db: DB,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table});`);
  const exists = (info.rows ?? []).some(row => row.name === column);
  if (exists) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}
