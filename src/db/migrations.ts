import { DB } from './types';

export interface Migration {
  version: number;
  up: (db: DB) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS words (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          word        TEXT    NOT NULL,
          translation TEXT    NOT NULL,
          status      TEXT    NOT NULL DEFAULT 'new',
          createdAt   INTEGER NOT NULL
        );
      `);
    },
  },
];