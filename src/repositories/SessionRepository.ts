import { getDatabase } from '../db/database';
import {
  TABLE,
  LearningSession,
  SessionType,
  ExerciseType,
} from '../db/types';
import { SessionEngine } from '../learning-engine/SessionEngine';

export interface SessionSummary {
  session: LearningSession;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  byExercise: Partial<
    Record<
      ExerciseType,
      {
        total: number;
        correct: number;
      }
    >
  >;
}

class SessionRepository {
  // ─── Create/finish session ──────────────────────

  async create(sessionType: SessionType, deckId?: number): Promise<number> {
    const db = getDatabase();
    await db.execute(
      `INSERT INTO ${TABLE.LEARNING_SESSIONS}
         (deckId, sessionType, startedAt, totalWords, correctAnswers, xpEarned)
       VALUES (?, ?, ?, 0, 0, 0);`,
      [deckId ?? null, sessionType, Date.now()],
    );
    const r = await db.execute('SELECT last_insert_rowid() as id;');
    return r.rows?.[0]?.id as number;
  }

  async finish(
    sessionId: number,
    params: {
      totalWords: number;
      correctAnswers: number;
      sessionType: SessionType;
    },
  ): Promise<number> {
    const xpEarned = SessionEngine.calculateXP({
      correctAnswers: params.correctAnswers,
      totalAnswers: params.totalWords,
      sessionType: params.sessionType,
    });

    const db = getDatabase();
    await db.execute(
      `UPDATE ${TABLE.LEARNING_SESSIONS}
       SET finishedAt     = ?,
           totalWords     = ?,
           correctAnswers = ?,
           xpEarned       = ?
       WHERE id = ?;`,
      [
        Date.now(),
        params.totalWords,
        params.correctAnswers,
        xpEarned,
        sessionId,
      ],
    );

    return xpEarned;
  }

  // ─── Запись результата упражнения ────────────────────
  // ─── Write exercise result ────────────────────

  async recordResult(params: {
    sessionId: number;
    wordId: number;
    exerciseType: ExerciseType;
    isCorrect: boolean;
    responseTimeMs: number | null;
  }): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `INSERT INTO ${TABLE.SESSION_RESULTS}
         (sessionId, wordId, exerciseType, isCorrect, responseTimeMs, answeredAt)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        params.sessionId,
        params.wordId,
        params.exerciseType,
        params.isCorrect ? 1 : 0,
        params.responseTimeMs,
        Date.now(),
      ],
    );
  }

  // ─── Get session data ────────────────────────────────

  async getById(sessionId: number): Promise<LearningSession | null> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.LEARNING_SESSIONS} WHERE id = ?;`,
      [sessionId],
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return this.toSession(row);
  }

  async getRecent(limit: number = 10): Promise<LearningSession[]> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT * FROM ${TABLE.LEARNING_SESSIONS}
       WHERE finishedAt IS NOT NULL
       ORDER BY finishedAt DESC
       LIMIT ?;`,
      [limit],
    );
    return (result.rows ?? []).map(this.toSession);
  }

  async getSummary(sessionId: number): Promise<SessionSummary | null> {
    const session = await this.getById(sessionId);
    if (!session) return null;

    const db = getDatabase();
    const result = await db.execute(
      `SELECT
         exerciseType,
         SUM(CASE WHEN isCorrect = 1 THEN 1 ELSE 0 END) AS correct,
         COUNT(*) AS total
       FROM ${TABLE.SESSION_RESULTS}
       WHERE sessionId = ?
       GROUP BY exerciseType;`,
      [sessionId],
    );

    const byExercise: SessionSummary['byExercise'] = {};
    let totalAnswers = 0;
    let correctAnswers = 0;

    for (const row of result.rows ?? []) {
      const type = row.exerciseType as ExerciseType;
      const correct = row.correct as number;
      const total = row.total as number;

      byExercise[type] = { total, correct };
      totalAnswers += total;
      correctAnswers += correct;
    }

    const accuracy = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;

    return { session, totalAnswers, correctAnswers, accuracy, byExercise };
  }

  async getStreakDays(): Promise<number> {
    const db = getDatabase();
    const result = await db.execute(
      `SELECT DISTINCT date(startedAt / 1000, 'unixepoch') AS day
       FROM ${TABLE.LEARNING_SESSIONS}
       WHERE finishedAt IS NOT NULL
       ORDER BY day DESC
       LIMIT 30;`,
    );

    const days = (result.rows ?? []).map(r => r.day as string);
    if (days.length === 0) return 0;

    let streak = 1;
    const today = new Date().toISOString().split('T')[0];
    if (days[0] !== today) return 0;

    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const current = new Date(days[i]);
      const diff = (prev.getTime() - current.getTime()) / 86400000;
      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private toSession(row: Record<string, unknown>): LearningSession {
    return {
      id: row.id as number,
      deckId: row.deckId as number | null,
      sessionType: row.sessionType as SessionType,
      startedAt: row.startedAt as number,
      finishedAt: row.finishedAt as number | null,
      totalWords: row.totalWords as number,
      correctAnswers: row.correctAnswers as number,
      xpEarned: row.xpEarned as number,
    };
  }
}

export const sessionRepository = new SessionRepository();
