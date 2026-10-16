import type { ReviewRating } from '../api/srs';

/**
 * Pure logic for the offline review queue — the one deliberate exception to
 * "course mutations are online-only" (plan, Phase 6). Only *events* are
 * queued: the server recomputes the schedule and stays authoritative, the
 * client never persists a weight it calculated itself.
 *
 * No I/O here; persistence and replay live in store/reviewQueueStore.ts.
 */
export interface QueuedReview {
  cardId: string;
  rating: ReviewRating;
  /** ISO 8601 — when the user actually answered, not when it was sent. */
  reviewedAt: string;
  /** Sent to the server so a replay is a no-op instead of a second review. */
  idempotencyKey: string;
  /**
   * The learner chose to carry on past today's quota before answering this.
   * Persisted with the review because a queued answer may only reach the server
   * hours later, and it has to arrive with the same permission it was given.
   */
  carryOnPastLimit?: boolean;
  /**
   * Who answered. An answer given offline can outlive the session it was given in — the
   * refresh token expires, someone else signs in — and must only ever go out as its own
   * learner's. Absent on answers queued by a build from before it was recorded.
   */
  userId?: string;
}

/**
 * Cap on the stored queue. A user reviewing offline should not be able to grow it without
 * end; past this point the oldest entries are dropped, because the newest answers describe
 * the card's current state best.
 *
 * A dropped answer is evidence the schedule never sees (offline plan, B7.5), so the cap is
 * sized for a month offline — the phone's session lifetime — at a heavy 100 reviews a day.
 * It stays well inside what one stored value can hold: an entry is about 200 bytes, the
 * queue about 600 KB at the cap, and Android reads a stored value through a 2 MB window.
 */
export const MAX_QUEUED_REVIEWS = 3000;

/** The share of a queue's cap at which the learner is told it is filling up. */
export const NEARLY_FULL_SHARE = 0.8;

export function enqueueReview(
  queue: QueuedReview[],
  review: QueuedReview,
  max: number = MAX_QUEUED_REVIEWS,
): QueuedReview[] {
  // Same card twice is legitimate (a lapsed card comes back within one
  // session), and order matters, so entries are appended, never merged.
  const next = [...queue, review];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function removeReviews(queue: QueuedReview[], keys: string[]): QueuedReview[] {
  if (keys.length === 0) return queue;
  const dropped = new Set(keys);
  return queue.filter((review) => !dropped.has(review.idempotencyKey));
}

/**
 * Whether a failed submission should stay queued for a later attempt.
 *
 * - no status (network error / timeout) → keep, that's the whole point.
 * - 401 → keep: the api client already tried a token refresh, and a signed-out
 *   user may sign back in.
 * - 429 (daily review cap) → keep: either the learner carries on and a resend
 *   goes through today, or tomorrow's reset takes it.
 * - 5xx → keep, the server may recover.
 * - other 4xx (404 card deleted, 403 someone else's card, 422 suspended) →
 *   drop: replaying it forever would block the queue on an answer that can
 *   never be accepted.
 */
export function shouldRetry(status: number | null): boolean {
  if (status === null) return true;
  if (status === 401 || status === 429) return true;
  return status >= 500;
}

/**
 * Whether an entry queued by `entryUserId` may go out in the session of `userId`. Without a
 * session nothing goes out. An entry from before the owner was recorded goes with whoever is
 * signed in — the phone only ever had one learner when such entries were written.
 */
export function isOwnedBy(entryUserId: string | undefined, userId: string | null): boolean {
  if (userId === null) return false;
  return entryUserId === undefined || entryUserId === userId;
}

export function makeIdempotencyKey(
  cardId: string,
  reviewedAt: string,
  nonce: string,
): string {
  return `${cardId}:${reviewedAt}:${nonce}`;
}

/** Random nonce with no crypto dependency — uniqueness per device is enough. */
export function randomNonce(): string {
  return Math.random().toString(36).slice(2, 10);
}
