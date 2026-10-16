import { getDatabase } from '../db/database';
import type { ReplicaQuota, ReplicaRow } from '../lib/srsReplica';

/**
 * Storage of the vocabulary card copy (migration v11). Plain reads and writes only — what the
 * rows mean, and when they are replaced, is `services/vocabularyReplica`'s business.
 */

const COLUMNS = [
  'cardId',
  'userId',
  'contentId',
  'state',
  'stability',
  'difficulty',
  'dueAt',
  'elapsedDays',
  'scheduledDays',
  'learningSteps',
  'reps',
  'lapses',
  'lastReviewedAt',
  'createdAt',
  'updatedAt',
] as const;

const UPSERT = `INSERT OR REPLACE INTO srs_card_replica (${COLUMNS.join(', ')})
  VALUES (${COLUMNS.map(() => '?').join(', ')});`;

type Params = (string | number | null)[];

function toParams(userId: string, row: ReplicaRow): Params {
  return [
    row.cardId,
    userId,
    row.contentId,
    row.state,
    row.stability,
    row.difficulty,
    row.dueAt,
    row.elapsedDays,
    row.scheduledDays,
    row.learningSteps,
    row.reps,
    row.lapses,
    row.lastReviewedAt,
    row.createdAt,
    row.updatedAt,
  ];
}

function fromDb(r: Record<string, unknown>): ReplicaRow {
  return {
    cardId: r.cardId as string,
    contentId: r.contentId as string,
    state: r.state as ReplicaRow['state'],
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    dueAt: r.dueAt as number,
    elapsedDays: r.elapsedDays as number,
    scheduledDays: r.scheduledDays as number,
    learningSteps: r.learningSteps as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    lastReviewedAt: (r.lastReviewedAt ?? null) as number | null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

/** Chunked so a learner's whole vocabulary is a handful of native calls. */
const CHUNK = 200;

class SrsReplicaRepository {
  async getAll(userId: string): Promise<ReplicaRow[]> {
    const result = await getDatabase().execute(
      'SELECT * FROM srs_card_replica WHERE userId = ?;',
      [userId],
    );
    return (result.rows ?? []).map(fromDb);
  }

  async get(userId: string, cardId: string): Promise<ReplicaRow | null> {
    const result = await getDatabase().execute(
      'SELECT * FROM srs_card_replica WHERE userId = ? AND cardId = ?;',
      [userId, cardId],
    );
    const row = result.rows?.[0];
    return row ? fromDb(row) : null;
  }

  async put(userId: string, row: ReplicaRow): Promise<void> {
    await getDatabase().execute(UPSERT, toParams(userId, row));
  }

  /**
   * The learner's copy becomes `rows`, except the cards in `keep`, which stay as they are —
   * their reviews have not reached the server yet, so its numbers are older than these.
   */
  async replaceAll(userId: string, rows: ReplicaRow[], keep: Set<string>): Promise<void> {
    const db = getDatabase();
    const incoming = rows.filter(row => !keep.has(row.cardId));
    const kept = [...keep];

    const statements: Array<[string, Params]> = [
      [
        kept.length > 0
          ? `DELETE FROM srs_card_replica WHERE userId = ? AND cardId NOT IN (${kept
              .map(() => '?')
              .join(', ')});`
          : 'DELETE FROM srs_card_replica WHERE userId = ?;',
        [userId, ...kept],
      ],
      ...incoming.map(row => [UPSERT, toParams(userId, row)] as [string, Params]),
    ];

    // The delete and the first chunk go together, so a crash between them cannot leave the
    // copy empty with nothing written yet.
    for (let i = 0; i < statements.length; i += CHUNK) {
      await db.executeBatch(statements.slice(i, i + CHUNK));
    }
  }

  async getQuota(userId: string): Promise<(ReplicaQuota & { syncedAt: number }) | null> {
    const result = await getDatabase().execute(
      'SELECT dailyLimit, reviewedToday, day, syncedAt FROM srs_replica_meta WHERE userId = ?;',
      [userId],
    );
    const r = result.rows?.[0];
    if (!r) return null;
    return {
      dailyLimit: r.dailyLimit as number,
      reviewedToday: r.reviewedToday as number,
      day: r.day as string,
      syncedAt: r.syncedAt as number,
    };
  }

  async putQuota(userId: string, quota: ReplicaQuota, syncedAt: number): Promise<void> {
    await getDatabase().execute(
      `INSERT OR REPLACE INTO srs_replica_meta (userId, dailyLimit, reviewedToday, day, syncedAt)
       VALUES (?, ?, ?, ?, ?);`,
      [userId, quota.dailyLimit, quota.reviewedToday, quota.day, syncedAt],
    );
  }
}

export const srsReplicaRepository = new SrsReplicaRepository();
