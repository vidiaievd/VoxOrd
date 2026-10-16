import { isServerOutOfReach } from '../api/isNetworkError';
import { getVocabularyReplica, type ReviewRating, type SrsCard } from '../api/srs';
import {
  applyLocalReview,
  countReview,
  dueRows,
  fromReplicaCard,
  localDay,
  mergeServerCard,
  quotaToday,
  toSrsCard,
} from '../lib/srsReplica';
import { srsReplicaRepository } from '../repositories/SrsReplicaRepository';
import { FsrsAdapter } from '../srs/fsrs-adapter';
import type { SrsEngine } from '../srs/engine.port';
import { authStore } from '../store/authStore';
import { reviewQueueStore } from '../store/reviewQueueStore';

/** Cards a review session draws from the copy, as many as `/srs/due` gives online. */
const DUE_LIMIT = 100;

export interface ReplicaDueQueue {
  cards: SrsCard[];
  reviewedToday: number;
  dailyLimit: number;
}

/**
 * Whether a failed due-queue load should fall back to the copy: the server was not reached,
 * or answered as one that is down. A refusal (4xx) is the server speaking, and stands.
 */
export function shouldUseReplica(error: unknown): boolean {
  return isServerOutOfReach(error);
}

/**
 * The phone's copy of the learner's vocabulary cards, kept with the server (offline plan, B1).
 *
 * - `refresh()` replaces the copy with the server's, once the queued reviews have gone out —
 *   `sessionSync` runs it after the queues. Cards whose reviews are still queued keep their
 *   local numbers until those reviews land.
 * - `recordReview()` applies a rating to the copy as the server will, so a word reviewed
 *   offline is not due again a minute later.
 * - `dueQueue()` is the due queue drawn from the copy when the server cannot give one.
 *
 * Every call is for the signed-in learner and does nothing without one.
 */
class VocabularyReplicaService {
  constructor(private readonly engine: SrsEngine = new FsrsAdapter()) {}

  async refresh(): Promise<void> {
    const userId = currentUserId();
    if (!userId) return;
    const replica = await getVocabularyReplica();
    // The answer may have taken long enough for the session to change hands.
    if (currentUserId() !== userId) return;

    const keep = await reviewQueueStore.pendingCardIds();
    await srsReplicaRepository.replaceAll(userId, replica.cards.map(fromReplicaCard), keep);

    const now = Date.now();
    await srsReplicaRepository.putQuota(
      userId,
      {
        dailyLimit: replica.dailyLimit,
        // Reviews still queued are not in the server's count yet.
        reviewedToday: replica.reviewedToday + keep.size,
        day: localDay(now),
      },
      now,
    );
  }

  async recordReview(cardId: string, rating: ReviewRating, reviewedAt: Date): Promise<void> {
    const userId = currentUserId();
    if (!userId) return;
    const at = reviewedAt.getTime();

    const row = await srsReplicaRepository.get(userId, cardId);
    if (row) {
      await srsReplicaRepository.put(userId, applyLocalReview(row, rating, at, this.engine));
    }
    const quota = await srsReplicaRepository.getQuota(userId);
    if (quota) {
      await srsReplicaRepository.putQuota(userId, countReview(quota, at), quota.syncedAt);
    }
  }

  /** The server's answer to a review: its numbers replace the preview. */
  async recordServerCard(card: SrsCard): Promise<void> {
    const userId = currentUserId();
    if (!userId || card.userId !== userId) return;
    const row = await srsReplicaRepository.get(userId, card.id);
    await srsReplicaRepository.put(userId, mergeServerCard(row, card));
  }

  /** Null when the copy was never taken — there is nothing to review from. */
  async dueQueue(now: number = Date.now()): Promise<ReplicaDueQueue | null> {
    const userId = currentUserId();
    if (!userId) return null;
    const quota = await srsReplicaRepository.getQuota(userId);
    if (!quota) return null;

    const rows = dueRows(await srsReplicaRepository.getAll(userId), now, DUE_LIMIT);
    return {
      cards: rows.map(row => toSrsCard(row, userId, this.engine, now)),
      ...quotaToday(quota, now),
    };
  }
}

function currentUserId(): string | null {
  return authStore.getState().user?.id ?? null;
}

export const vocabularyReplica = new VocabularyReplicaService();
