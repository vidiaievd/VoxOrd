import { getDatabase } from '../db/database';
import { DailyActivity, DailyGoal, TABLE } from '../db/types';

function todayString(): string {
  return new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
}

function dateString(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().split('T')[0];
}

class ActivityRepository {
  // ─── Daily Activity ──────────────────────────────────

  async getToday(): Promise<DailyActivity | null> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.DAILY_ACTIVITY} WHERE date = ?;`,
      [todayString()],
    );
    const row = result.rows?.[0];
    if (!row) return null;

    return this.rowToActivity(row);
  }

  async recordWords(count: number, xp: number): Promise<void> {
    const db = getDatabase();
    const date = todayString();

    await db.execute(
      `INSERT INTO ${TABLE.DAILY_ACTIVITY} (date, wordsStudied, xpEarned, sessionsCount)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(date) DO UPDATE SET
         wordsStudied  = wordsStudied + excluded.wordsStudied,
         xpEarned      = xpEarned    + excluded.xpEarned,
         sessionsCount = sessionsCount + 1;`,
      [date, count, xp],
    );
  }

  // Last 7 days activity
  async getLastDays(days: number = 7): Promise<DailyActivity[]> {
    const db = getDatabase();
    const dates = Array.from({ length: days }, (_, i) =>
      dateString(days - 1 - i),
    );
    const result = await db.execute(
      `SELECT * FROM ${TABLE.DAILY_ACTIVITY}
       WHERE date IN (${dates.map(() => '?').join(',')})
       ORDER BY date ASC;`,
      dates,
    );

    const rowMap = new Map(
      (result.rows ?? []).map(r => [r.date as string, this.rowToActivity(r)]),
    );

    // Fill in missing days with zero activity
    return dates.map(
      (date, index) =>
        rowMap.get(date) ?? {
          id: index,
          date,
          wordsStudied: 0,
          xpEarned: 0,
          sessionsCount: 0,
        },
    );
  }

  // ─── Daily Goal ──────────────────────────────────────

  async getGoal(): Promise<DailyGoal | null> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.DAILY_GOAL} WHERE id = 1;`,
    );
    const row = result.rows?.[0];
    if (!row) return null;

    return {
      id: row.id as number,
      goal: row.goal as number,
      updatedAt: row.updatedAt as number,
    };
  }

  async updateGoal(goal: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `UPDATE ${TABLE.DAILY_GOAL} SET goal = ?, updatedAt = ? WHERE id = 1;`,
      [goal, Date.now()],
    );
  }

  // Daily Progress
  async getTodayProgress(): Promise<{ done: number; goal: number }> {
    const [today, goalRecord] = await Promise.all([
      this.getToday(),
      this.getGoal(),
    ]);

    return {
      done: today?.wordsStudied ?? 0,
      goal: goalRecord?.goal ?? 20,
    };
  }

  private rowToActivity(row: Record<string, unknown>): DailyActivity {
    return {
      id: row.id as number,
      date: row.date as string,
      wordsStudied: row.wordsStudied as number,
      xpEarned: row.xpEarned as number,
      sessionsCount: row.sessionsCount as number,
    };
  }
}

export const activityRepository = new ActivityRepository();
