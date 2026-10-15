import type { ReplicaCard, ReviewRating, SrsCard, SrsCardState } from '../api/srs';
import type { SrsCard as EngineCard, SrsEngine } from '../srs/engine.port';

/**
 * The phone's copy of the learner's vocabulary cards (offline plan, B1) — pure logic, no I/O.
 *
 * The server owns the schedule. The copy exists so course words can be reviewed without it:
 * offline, a rating is applied here with the same FSRS profile the server uses, which gives
 * the next due date the server will give too, and the rating itself goes to the review queue
 * with its original time. The next refresh replaces whatever was computed here.
 */

/** One card of the copy. Times the engine reads are epoch ms; the server's stamps stay ISO. */
export interface ReplicaRow {
  cardId: string;
  contentId: string;
  state: SrsCardState;
  stability: number;
  difficulty: number;
  dueAt: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

/** The day's vocabulary budget, as the last refresh saw it and reviews since counted on. */
export interface ReplicaQuota {
  dailyLimit: number;
  reviewedToday: number;
  /** The local day `reviewedToday` counts, `YYYY-MM-DD`. */
  day: string;
}

/** The phone's own calendar day — the budget resets with it. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseTime(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function fromReplicaCard(card: ReplicaCard): ReplicaRow {
  return {
    cardId: card.id,
    contentId: card.contentId,
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: parseTime(card.dueAt) ?? 0,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: parseTime(card.lastReviewedAt),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

/**
 * The server's answer to a review, folded into the copy. The review answer carries no
 * `elapsedDays` or `learningSteps`; the ones computed here for the same rating stand in —
 * the same profile computes the same numbers.
 */
export function mergeServerCard(row: ReplicaRow | null, card: SrsCard): ReplicaRow {
  return {
    cardId: card.id,
    contentId: card.contentId,
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: parseTime(card.dueAt) ?? 0,
    elapsedDays: row?.elapsedDays ?? 0,
    scheduledDays: card.scheduledDays,
    learningSteps: row?.learningSteps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: parseTime(card.lastReviewedAt),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

function toEngineCard(row: ReplicaRow, profileId: string): EngineCard | null {
  if (row.state === 'SUSPENDED') return null;
  return {
    state: row.state,
    stability: row.stability,
    difficulty: row.difficulty,
    dueAt: row.dueAt,
    reps: row.reps,
    lapses: row.lapses,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    lastReviewedAt: row.lastReviewedAt,
    profileId,
  };
}

/**
 * A rating applied to the copy, as the server will apply it. A suspended card is left as it
 * is: the server refuses a review of it, and so must the preview.
 */
export function applyLocalReview(
  row: ReplicaRow,
  rating: ReviewRating,
  reviewedAt: number,
  engine: SrsEngine,
): ReplicaRow {
  const card = toEngineCard(row, engine.profileId);
  if (!card) return row;
  const next = engine.review(card, rating, reviewedAt);
  return {
    ...row,
    state: next.state,
    stability: next.stability,
    difficulty: next.difficulty,
    dueAt: next.dueAt,
    elapsedDays: next.elapsedDays,
    scheduledDays: next.scheduledDays,
    learningSteps: next.learningSteps,
    reps: next.reps,
    lapses: next.lapses,
    lastReviewedAt: next.lastReviewedAt,
    updatedAt: new Date(reviewedAt).toISOString(),
  };
}

/** Cards due at `now`, earliest first, as the server's due queue orders them. */
export function dueRows(rows: ReplicaRow[], now: number, limit: number): ReplicaRow[] {
  return rows
    .filter(row => row.state !== 'SUSPENDED' && row.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, limit);
}

/**
 * A copy row in the shape the review screens take from `/srs/due`. No `front`/`back`: the
 * word is the imported deck's. Predictions come from the local engine, without labels.
 */
export function toSrsCard(
  row: ReplicaRow,
  userId: string,
  engine: SrsEngine,
  now: number,
): SrsCard {
  const card = toEngineCard(row, engine.profileId);
  return {
    id: row.cardId,
    userId,
    contentType: 'VOCABULARY_WORD',
    contentId: row.contentId,
    state: row.state,
    dueAt: new Date(row.dueAt).toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewedAt: row.lastReviewedAt === null ? null : new Date(row.lastReviewedAt).toISOString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    predicted: card
      ? engine.predict(card, now).map(p => ({
          rating: p.rating,
          scheduledDays: p.scheduledDays,
          label: '',
        }))
      : [],
    front: null,
    back: null,
  };
}

/** Today's count against the cap; a count kept for another day is today's zero. */
export function quotaToday(
  quota: ReplicaQuota,
  now: number,
): { reviewedToday: number; dailyLimit: number } {
  return {
    reviewedToday: quota.day === localDay(now) ? quota.reviewedToday : 0,
    dailyLimit: quota.dailyLimit,
  };
}

/** One more review counted against the day it was given on. */
export function countReview(quota: ReplicaQuota, reviewedAt: number): ReplicaQuota {
  const day = localDay(reviewedAt);
  return {
    ...quota,
    reviewedToday: quota.day === day ? quota.reviewedToday + 1 : 1,
    day,
  };
}
