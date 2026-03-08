import { getDatabase } from '../db/database';
import { UserProfile, UserStats, TABLE } from '../db/types';

class UserRepository {
  // ─── Profile ────────────────────────────────────────

  async getProfile(): Promise<UserProfile | null> {
    const db     = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.USER_PROFILE} WHERE id = 1;`
    );
    const row = result.rows?.[0];
    if (!row) return null;

    return {
      id:        row.id        as number,
      name:      row.name      as string,
      avatar:    row.avatar    as string,
      createdAt: row.createdAt as number,
    };
  }

  async updateProfile(data: Partial<Pick<UserProfile, 'name' | 'avatar'>>): Promise<void> {
    const db     = getDatabase();
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(data);
    await db.execute(
      `UPDATE ${TABLE.USER_PROFILE} SET ${fields} WHERE id = 1;`,
      values
    );
  }

  // ─── Stats ───────────────────────────────────────────

  async getStats(): Promise<UserStats | null> {
    const db     = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.USER_STATS} WHERE id = 1;`
    );
    const row = result.rows?.[0];
    if (!row) return null;

    return {
      id:                row.id                as number,
      xp:                row.xp                as number,
      streak:            row.streak            as number,
      longestStreak:     row.longestStreak     as number,
      lastActivityAt:    row.lastActivityAt    as number | null,
      totalWordsLearned: row.totalWordsLearned as number,
      totalSessions:     row.totalSessions     as number,
    };
  }

  async addXP(amount: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE ${TABLE.USER_STATS} SET xp = xp + ? WHERE id = 1;`,
      [amount]
    );
  }

  async recordActivity(): Promise<void> {
    const db  = getDatabase();
    const now = Date.now();

    const result = await db.execute(
      `SELECT lastActivityAt, streak FROM ${TABLE.USER_STATS} WHERE id = 1;`
    );
    const row = result.rows?.[0];
    if (!row) return;

    const lastActivity = row.lastActivityAt as number | null;
    const today        = new Date().toDateString();
    const lastDay      = lastActivity
      ? new Date(lastActivity).toDateString()
      : null;

    if (lastDay === today) return;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = lastDay === yesterday
      ? (row.streak as number) + 1
      : 1;

    await db.execute(
      `UPDATE ${TABLE.USER_STATS}
       SET streak         = ?,
           longestStreak  = MAX(longestStreak, ?),
           lastActivityAt = ?,
           totalSessions  = totalSessions + 1
       WHERE id = 1;`,
      [newStreak, newStreak, now]
    );
  }

  async incrementWordsLearned(count: number = 1): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE ${TABLE.USER_STATS}
       SET totalWordsLearned = totalWordsLearned + ?
       WHERE id = 1;`,
      [count]
    );
  }
}

export const userRepository = new UserRepository();