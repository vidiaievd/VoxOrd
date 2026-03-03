import { DB } from './types';
import { migrations } from './migrations';

async function ensureMigrationsTable(db: DB): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );
  `);
  console.log('[DB] schema_migrations table ready');
}

async function getCurrentVersion(db: DB): Promise<number> {
  const result = await db.execute(
    'SELECT MAX(version) as version FROM schema_migrations;'
  );
  const version = result.rows?.[0]?.version;
  console.log('[DB] Current version raw:', JSON.stringify(result.rows?.[0]));
  return typeof version === 'number' ? version : 0;
}

export async function runMigrations(db: DB): Promise<void> {
  console.log('[DB] Starting migrations...');
  await ensureMigrationsTable(db);
  const currentVersion = await getCurrentVersion(db);
  console.log('[DB] Current version:', currentVersion);

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  console.log('[DB] Pending migrations:', pending.map(m => m.version));

  if (pending.length === 0) {
    console.log('[DB] No pending migrations');
    return;
  }

  for (const migration of pending) {
    try {
      console.log(`[DB] Running migration v${migration.version}...`);
      await migration.up(db);
      await db.execute(
        'INSERT INTO schema_migrations (version) VALUES (?);',
        [migration.version]
      );
      console.log(`[DB] Migration v${migration.version} done`);
    } catch (e) {
      console.error(`[DB] Migration v${migration.version} FAILED:`, e);
      throw e;
    }
  }

  console.log(`[DB] All migrations complete. Version: ${pending.at(-1)!.version}`);
}