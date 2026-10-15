import { DB } from './types';

/**
 * The rows the app needs before anything else exists: the local profile, the stats it
 * counts into and the daily goal. Each is made only when missing, so this is safe on every
 * start.
 *
 * It once seeded three demo decks of Norwegian words as well; those went with migration v12
 * (offline plan, B1.5) — words now come from course vocabulary lists and «My words».
 */
export async function seedAppRows(db: DB): Promise<void> {
  const now = Date.now();

  const profile = await db.execute('SELECT COUNT(*) as count FROM user_profile;');
  if ((profile.rows?.[0]?.count as number) === 0) {
    await db.execute(
      `INSERT INTO user_profile (id, name, avatar, createdAt) VALUES (1, 'User', '👤', ?);`,
      [now],
    );
  }

  const stats = await db.execute('SELECT COUNT(*) as count FROM user_stats;');
  if ((stats.rows?.[0]?.count as number) === 0) {
    await db.execute(
      `INSERT INTO user_stats (id, xp, streak, longestStreak, totalWordsLearned, totalSessions)
       VALUES (1, 0, 0, 0, 0, 0);`,
    );
  }

  const goal = await db.execute('SELECT COUNT(*) as count FROM daily_goal;');
  if ((goal.rows?.[0]?.count as number) === 0) {
    await db.execute('INSERT INTO daily_goal (id, goal, updatedAt) VALUES (1, 20, ?);', [now]);
  }
}
