import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import { reviewCard, type ReviewRating, type SrsCard } from '../api/srs';
import {
  enqueueReview,
  makeIdempotencyKey,
  randomNonce,
  removeReviews,
  shouldRetry,
  type QueuedReview,
} from '../lib/reviewQueue';

const storage = createAsyncStorage('voxord_srs_review_queue');
const STORAGE_KEY = 'queue';

/**
 * Durable queue of course-word review events (plan, Phase 8). Every review
 * goes through here: it is written to the queue first, then flushed, so an
 * answer is never lost to a dropped connection mid-request. The server owns
 * the schedule — this queue carries answers, never computed weights — and the
 * idempotency key makes a replay a no-op rather than a second review.
 *
 * Kept entirely separate from personal-word state (`word_progress` in SQLite),
 * which is offline-first and never talks to the server.
 */
class ReviewQueueStore {
  private queue: QueuedReview[] = [];
  private loaded = false;
  private flushing: Promise<Map<string, SrsCard>> | null = null;
  private listeners = new Set<() => void>();

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as QueuedReview[];
    } catch (e) {
      console.warn('[ReviewQueue] Failed to load:', e);
    }
    this.loaded = true;
    this.notify();
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Records an answer and tries to deliver it immediately. Resolves with the
   * server's card when the round trip succeeded, or null when the answer was
   * queued instead — the caller advances to the next card either way, which is
   * what makes the trainer usable offline.
   */
  async submit(
    cardId: string,
    rating: ReviewRating,
    reviewedAt: Date = new Date(),
    options: { carryOnPastLimit?: boolean } = {},
  ): Promise<SrsCard | null> {
    await this.load();

    const review: QueuedReview = {
      cardId,
      rating,
      reviewedAt: reviewedAt.toISOString(),
      idempotencyKey: makeIdempotencyKey(cardId, reviewedAt.toISOString(), randomNonce()),
      ...(options.carryOnPastLimit ? { carryOnPastLimit: true } : {}),
    };

    this.queue = enqueueReview(this.queue, review);
    await this.persist();

    // Flushing the whole queue (rather than sending this one review) keeps
    // older queued answers ahead of the new one.
    let delivered = await this.flush();
    if (this.isQueued(review.idempotencyKey)) {
      // A flush already in progress had snapshotted the queue before this
      // review joined it; one more pass picks it up.
      delivered = await this.flush();
    }

    return delivered.get(review.idempotencyKey) ?? null;
  }

  private isQueued(idempotencyKey: string): boolean {
    return this.queue.some((review) => review.idempotencyKey === idempotencyKey);
  }

  /**
   * Replays everything queued, oldest first. Single-flight: a second call
   * while a flush is running joins it instead of sending the same reviews
   * twice. Stops at the first entry that deserves a retry, so answers keep
   * their order — a card answered AGAIN then GOOD must not land the other way
   * round.
   */
  async flush(): Promise<Map<string, SrsCard>> {
    if (this.flushing) return this.flushing;

    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<Map<string, SrsCard>> {
    await this.load();

    const delivered = new Map<string, SrsCard>();
    const settled: string[] = [];

    for (const review of [...this.queue]) {
      const result = await this.deliver(review);
      if (result === 'kept') break;
      if (result !== 'rejected') delivered.set(review.idempotencyKey, result);
      settled.push(review.idempotencyKey);
    }

    if (settled.length > 0) {
      this.queue = removeReviews(this.queue, settled);
      await this.persist();
    }

    return delivered;
  }

  /**
   * One submission attempt. 'kept' means it stays queued for later; 'rejected'
   * means the server can never accept it and it is dropped (a deleted card, a
   * suspended one) — silently, since there is nothing the user could do.
   */
  private async deliver(review: QueuedReview): Promise<SrsCard | 'kept' | 'rejected'> {
    try {
      return await reviewCard(review.cardId, {
        rating: review.rating,
        reviewedAt: review.reviewedAt,
        idempotencyKey: review.idempotencyKey,
        // Only sent when it was actually chosen: a default `false` on every
        // review would blur a deliberate answer into a routine field.
        ...(review.carryOnPastLimit ? { carryOnPastLimit: true } : {}),
      });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : null;
      if (shouldRetry(status)) return 'kept';
      console.warn(
        `[ReviewQueue] Dropping review of card ${review.cardId} — server refused it (${status}).`,
      );
      return 'rejected';
    }
  }

  private async persist(): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[ReviewQueue] Failed to persist:', e);
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const reviewQueueStore = new ReviewQueueStore();
