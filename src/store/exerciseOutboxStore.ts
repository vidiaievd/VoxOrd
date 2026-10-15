import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import { startOrJoinAttempt, submitAttempt } from '../api/exercises';
import { upsertProgress } from '../api/progress';
import type { UpsertProgressRequest } from '../api/types';
import { isOwnedBy, randomNonce, shouldRetry } from '../lib/reviewQueue';
import { authStore } from './authStore';

const storage = createAsyncStorage('voxord_exercise_outbox');
const STORAGE_KEY = 'queue';

/** An exercise answered offline and graded on the phone, on its way to the engine. */
export interface QueuedAttempt {
  kind: 'attempt';
  id: string;
  userId?: string;
  exerciseId: string;
  /** The exercise's target language, as the runner starts attempts with. */
  language: string;
  submittedAnswer: unknown;
  timeSpentSeconds: number;
  locale: string;
  /** ISO 8601 — when the learner checked, not when it was sent. */
  answeredAt: string;
}

/** A finished exercise's progress record, on its way to learning-service. */
export interface QueuedProgress {
  kind: 'progress';
  id: string;
  userId?: string;
  request: UpsertProgressRequest;
  queuedAt: string;
}

export type OutboxEntry = QueuedAttempt | QueuedProgress;

/** Bounded like the review queue: a week offline must not grow storage without end. */
export const MAX_OUTBOX_ENTRIES = 500;

/**
 * Exercise work done without the server (offline plan, B4): attempts graded on the phone and
 * the progress records of the sets they finished. Sent in order once the session is online
 * (`sessionSync`), each in its learner's session only.
 *
 * An attempt is replayed as the phone would have made it online — started (or joined, if one
 * was left in progress) and submitted with the same answer — and the engine grades it again
 * with its own grader; its verdict is the one recorded. The engine stamps it with the time it
 * arrives: `answeredAt` is kept for the day an offline-attempt route takes original times.
 * A progress record is an upsert, so sending one twice changes nothing.
 */
class ExerciseOutboxStore {
  private queue: OutboxEntry[] = [];
  private loaded = false;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as OutboxEntry[];
    } catch (e) {
      console.warn('[ExerciseOutbox] Failed to load:', e);
    }
    this.loaded = true;
    this.notify();
  }

  /** Entries of the signed-in learner still waiting for the server. */
  get pendingCount(): number {
    const userId = currentUserId();
    return this.queue.filter(entry => isOwnedBy(entry.userId, userId)).length;
  }

  async enqueueAttempt(
    attempt: Omit<QueuedAttempt, 'kind' | 'id' | 'userId'>,
  ): Promise<void> {
    await this.add({ kind: 'attempt', id: randomNonce(), ...withOwner(), ...attempt });
  }

  async enqueueProgress(request: UpsertProgressRequest): Promise<void> {
    await this.add({
      kind: 'progress',
      id: randomNonce(),
      ...withOwner(),
      request,
      queuedAt: new Date().toISOString(),
    });
  }

  /** Sends everything queued, oldest first. Single-flight; stops at the first that must wait. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async add(entry: OutboxEntry): Promise<void> {
    await this.load();
    const next = [...this.queue, entry];
    this.queue = next.length > MAX_OUTBOX_ENTRIES ? next.slice(next.length - MAX_OUTBOX_ENTRIES) : next;
    await this.persist();
  }

  private async doFlush(): Promise<void> {
    await this.load();
    const userId = currentUserId();
    const settled: string[] = [];

    for (const entry of [...this.queue]) {
      if (!isOwnedBy(entry.userId, userId)) continue;
      const result = await this.deliver(entry);
      // Order matters: a set's progress follows its attempts, so nothing passes one that waits.
      if (result === 'kept') break;
      settled.push(entry.id);
    }

    if (settled.length > 0) {
      const done = new Set(settled);
      this.queue = this.queue.filter(entry => !done.has(entry.id));
      await this.persist();
    }
  }

  private async deliver(entry: OutboxEntry): Promise<'sent' | 'kept' | 'dropped'> {
    try {
      if (entry.kind === 'progress') {
        await upsertProgress(entry.request);
        return 'sent';
      }
      // Joining matters on a replay: a start that went through before the connection died
      // left an attempt in progress, and the submit closes it rather than a second one.
      const attempt = await startOrJoinAttempt(entry.exerciseId, {
        language: entry.language,
        mode: 'PRACTICE',
      });
      await submitAttempt(entry.exerciseId, attempt.attemptId, {
        submittedAnswer: entry.submittedAnswer,
        timeSpentSeconds: entry.timeSpentSeconds,
        locale: entry.locale,
      });
      return 'sent';
    } catch (e) {
      const status = e instanceof ApiError ? e.status : null;
      if (shouldRetry(status)) return 'kept';
      console.warn(
        `[ExerciseOutbox] Dropping ${entry.kind} ${
          entry.kind === 'attempt' ? entry.exerciseId : entry.request.contentId
        } — refused (${status}).`,
      );
      return 'dropped';
    }
  }

  private async persist(): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[ExerciseOutbox] Failed to persist:', e);
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

function currentUserId(): string | null {
  return authStore.getState().user?.id ?? null;
}

function withOwner(): { userId?: string } {
  const userId = currentUserId();
  return userId ? { userId } : {};
}

export const exerciseOutboxStore = new ExerciseOutboxStore();
