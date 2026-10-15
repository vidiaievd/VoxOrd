import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import { remoteAttempts } from '../api/exercises';
import { upsertProgress } from '../api/progress';
import type { UpsertProgressRequest } from '../api/types';
import { isOwnedBy, randomNonce, shouldRetry } from '../lib/reviewQueue';
import type { JournalOp } from '../offline/engine/engine';
import { authStore } from './authStore';

const storage = createAsyncStorage('voxord_exercise_outbox');
const STORAGE_KEY = 'queue';
const ATTEMPT_IDS_KEY = 'attemptIds';

/**
 * An exercise answered offline and graded on the phone, handed in once. Written by builds
 * before the local engine; still replayed, never written now.
 */
export interface QueuedAttempt {
  kind: 'attempt';
  id: string;
  userId?: string;
  exerciseId: string;
  language: string;
  submittedAnswer: unknown;
  timeSpentSeconds: number;
  locale: string;
  answeredAt: string;
}

/**
 * The calls made on one attempt worked on the phone (`src/offline/engine`), in order, to be
 * made again on the server: start it, then every submit, answer, check, reveal, self-check
 * and draft as it happened. The engine grades them again from the start, with its own budgets
 * and its own record — the replay is the attempt, the phone's run of it was the preview.
 */
export interface QueuedSession {
  kind: 'session';
  id: string;
  userId?: string;
  /** The phone's attempt (`offline:…`); the server's is looked up by it. */
  localAttemptId: string;
  exerciseId: string;
  language: string;
  ops: JournalOp[];
  /** How many of `ops` have reached the server. */
  sent: number;
}

/** A finished exercise's or lesson's progress record, on its way to learning-service. */
export interface QueuedProgress {
  kind: 'progress';
  id: string;
  userId?: string;
  request: UpsertProgressRequest;
  queuedAt: string;
}

export type OutboxEntry = QueuedAttempt | QueuedSession | QueuedProgress;

/** Bounded like the review queue: a week offline must not grow storage without end. */
export const MAX_OUTBOX_ENTRIES = 500;

/**
 * Exercise work done without the server (offline plan, B4): the attempts worked on the phone
 * and the progress of what they finished. Sent in order once the session is online
 * (`sessionSync`), each in its learner's session only. An attempt's later calls join the entry
 * already queued for it, so they reach the server on the same attempt; one sent in part goes on
 * from where it stopped. A refused call is dropped and the rest go on — the engine refuses what
 * it would have refused online. A progress record is an upsert, so sending one twice changes
 * nothing. The engine stamps every call with the time it arrives.
 */
class ExerciseOutboxStore {
  private queue: OutboxEntry[] = [];
  /** Local attempt id → the attempt its replay made on the server. */
  private attemptIds: Record<string, string> = {};
  private loaded = false;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as OutboxEntry[];
      const ids = await storage.getItem(ATTEMPT_IDS_KEY);
      if (ids) this.attemptIds = JSON.parse(ids) as Record<string, string>;
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

  /** One call made on a local attempt; it joins the entry already queued for that attempt. */
  async recordLocalOp(
    attempt: { id: string; userId: string; exerciseId: string; targetLanguage: string },
    op: JournalOp,
  ): Promise<void> {
    await this.load();
    const open = this.queue.find(
      (entry): entry is QueuedSession =>
        entry.kind === 'session' && entry.localAttemptId === attempt.id,
    );
    if (open) {
      open.ops = [...open.ops, op];
      await this.persist();
      return;
    }
    await this.add({
      kind: 'session',
      id: randomNonce(),
      userId: attempt.userId,
      localAttemptId: attempt.id,
      exerciseId: attempt.exerciseId,
      language: attempt.targetLanguage,
      ops: [op],
      sent: 0,
    });
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
    this.queue =
      next.length > MAX_OUTBOX_ENTRIES ? next.slice(next.length - MAX_OUTBOX_ENTRIES) : next;
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
    if (entry.kind === 'session') return this.deliverSession(entry);
    try {
      if (entry.kind === 'progress') {
        await upsertProgress(entry.request);
        return 'sent';
      }
      const attempt = await remoteAttempts.startOrJoinAttempt(entry.exerciseId, {
        language: entry.language,
        mode: 'PRACTICE',
      });
      await remoteAttempts.submitAttempt(entry.exerciseId, attempt.attemptId, {
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

  /** The calls of one local attempt, from where the last flush stopped. */
  private async deliverSession(entry: QueuedSession): Promise<'sent' | 'kept'> {
    let serverId = this.attemptIds[entry.localAttemptId];
    if (!serverId) {
      try {
        // Joining matters: a start that reached the server before the connection died left
        // an attempt in progress there, and the calls belong on it.
        const started = await remoteAttempts.startOrJoinAttempt(entry.exerciseId, {
          language: entry.language,
          mode: 'PRACTICE',
        });
        serverId = started.attemptId;
      } catch (e) {
        if (shouldRetry(e instanceof ApiError ? e.status : null)) return 'kept';
        console.warn(`[ExerciseOutbox] Dropping attempt at ${entry.exerciseId} — start refused.`);
        return 'sent';
      }
      this.attemptIds = { ...this.attemptIds, [entry.localAttemptId]: serverId };
      await this.persistIds();
    }

    while (entry.sent < entry.ops.length) {
      const op = entry.ops[entry.sent];
      try {
        await replay(entry.exerciseId, serverId, op);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        if (shouldRetry(status)) return 'kept';
        // Refused on the server as it would have been online; the rest of the attempt goes on.
        console.warn(`[ExerciseOutbox] ${op.op} on ${entry.exerciseId} refused (${status}).`);
      }
      entry.sent += 1;
      await this.persist();
    }
    return 'sent';
  }

  private async persist(): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[ExerciseOutbox] Failed to persist:', e);
    }
    this.notify();
  }

  private async persistIds(): Promise<void> {
    // A few hundred attempts is years of offline work; older mappings are no longer needed.
    const entries = Object.entries(this.attemptIds);
    if (entries.length > 300) this.attemptIds = Object.fromEntries(entries.slice(-300));
    try {
      await storage.setItem(ATTEMPT_IDS_KEY, JSON.stringify(this.attemptIds));
    } catch (e) {
      console.warn('[ExerciseOutbox] Failed to persist attempt ids:', e);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

/** One journalled call, made again on the server attempt. */
async function replay(exerciseId: string, attemptId: string, op: JournalOp): Promise<void> {
  switch (op.op) {
    case 'submit':
      await remoteAttempts.submitAttempt(exerciseId, attemptId, op.body);
      return;
    case 'answer':
      await remoteAttempts.answerQuestion(exerciseId, attemptId, op.body);
      return;
    case 'checkRow':
      await remoteAttempts.checkRow(exerciseId, attemptId, op.body);
      return;
    case 'reveal':
      await remoteAttempts.revealAnswers(exerciseId, attemptId);
      return;
    case 'selfCheck':
      await remoteAttempts.selfCheck(exerciseId, attemptId, op.draftAnswer);
      return;
    case 'draft':
      await remoteAttempts.saveDraft(exerciseId, attemptId, op.draftAnswer);
      return;
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
