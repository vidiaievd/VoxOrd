import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import { remoteAttempts, type ReplayTime } from '../api/exercises';
import { upsertProgress } from '../api/progress';
import type { UpsertProgressRequest } from '../api/types';
import { NEARLY_FULL_SHARE, isOwnedBy, randomNonce, shouldRetry } from '../lib/reviewQueue';
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
  /**
   * When the phone started the attempt (offline plan, B4), handed to the server's start so
   * the attempt begins then. Absent in entries written before it existed.
   */
  startedAt?: string;
  /**
   * `minimal_pairs`: the sitting the phone dealt (offline plan, B6). The replay's start hands it
   * over so the answers land on the probes they were given to; absent for every other template.
   */
  probeDraw?: unknown[];
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

/**
 * Bounded like the review queue, and for the same reason sized generously (offline plan,
 * B7.5): a dropped entry is a finished exercise the SRS never hears about. An entry is a
 * whole attempt — up to a couple of kilobytes with its answers — so a thousand keeps the queue
 * under the 2 MB Android reads a stored value through; that is a month of 30 exercises a day.
 */
export const MAX_OUTBOX_ENTRIES = 1000;

/**
 * Exercise work done without the server (offline plan, B4): the attempts worked on the phone
 * and the progress of what they finished. Sent in order once the session is online
 * (`sessionSync`), each in its learner's session only. An attempt's later calls join the entry
 * already queued for it, so they reach the server on the same attempt; one sent in part goes on
 * from where it stopped. A refused call is dropped and the rest go on — the engine refuses what
 * it would have refused online. A progress record is an upsert, so sending one twice changes
 * nothing. Every call is dated when the phone made it (offline plan, B4); the engine bounds
 * what it believes of the phone's clock.
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

  /**
   * Close enough to the cap that the oldest work is about to be dropped (offline plan, B7.5).
   * Counts every learner's entries: they share the stored queue, and its cap.
   */
  get nearlyFull(): boolean {
    return this.queue.length >= MAX_OUTBOX_ENTRIES * NEARLY_FULL_SHARE;
  }

  /** One call made on a local attempt; it joins the entry already queued for that attempt. */
  async recordLocalOp(
    attempt: {
      id: string;
      userId: string;
      exerciseId: string;
      targetLanguage: string;
      startedAt?: string;
      probeDraw?: unknown;
    },
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
      ...(attempt.startedAt ? { startedAt: attempt.startedAt } : {}),
      ...(Array.isArray(attempt.probeDraw) ? { probeDraw: attempt.probeDraw } : {}),
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
        // A set's progress, queued by a build before plan 76 (2.6). The attempt queued ahead
        // of it is what records the exercise now, and the server ignores this one — so it
        // settles here, without a request.
        if (entry.request.contentType === 'EXERCISE') return 'sent';
        // Queued because the server could not be reached, so the moment it was queued is the
        // moment the work was finished.
        await upsertProgress({ occurredAt: entry.queuedAt, ...entry.request });
        return 'sent';
      }
      const time = replayTime(entry.answeredAt);
      const attempt = await remoteAttempts.startOrJoinAttempt(
        entry.exerciseId,
        { language: entry.language, mode: 'PRACTICE' },
        ...timeArg(time),
      );
      await remoteAttempts.submitAttempt(
        entry.exerciseId,
        attempt.attemptId,
        {
          submittedAnswer: entry.submittedAnswer,
          timeSpentSeconds: entry.timeSpentSeconds,
          locale: entry.locale,
        },
        ...timeArg(time),
      );
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
    if (!serverId && entry.probeDraw) {
      try {
        serverId = await startDealtSitting(entry, entry.probeDraw);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        if (shouldRetry(status)) return 'kept';
        // Over the author's limit, or a document edited since the download: the sitting the
        // student finished on the phone does not reach the server. Said loudly, as it is lost.
        console.error(
          `[ExerciseOutbox] Sitting at ${entry.exerciseId} refused on replay (${status} ${
            e instanceof ApiError ? (e.code ?? '') : ''
          }) — its answers are lost.`,
        );
        return 'sent';
      }
      this.attemptIds = { ...this.attemptIds, [entry.localAttemptId]: serverId };
      await this.persistIds();
    }
    if (!serverId) {
      try {
        serverId = await startForReplay(entry);
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

/**
 * The start of a `minimal_pairs` sitting dealt on the phone, with that draw. A start already
 * made with it is handed back by the server. Another sitting left open there — begun on the web
 * and never finished — is named in a 409 `MP_DRAW_CONFLICT`; it is abandoned, as the web does
 * with a stale attempt, and the start made once more. The finished sitting outweighs the
 * unfinished one, and nothing of it had been scored.
 */
async function startDealtSitting(entry: QueuedSession, probeDraw: unknown[]): Promise<string> {
  const body = { language: entry.language, mode: 'PRACTICE' as const, probeDraw };
  const time = replayTime(entry.startedAt);
  try {
    return (await remoteAttempts.startAttempt(entry.exerciseId, body, ...timeArg(time))).attemptId;
  } catch (e) {
    const open =
      e instanceof ApiError && e.status === 409 && e.code === 'MP_DRAW_CONFLICT'
        ? (e.body as { openAttemptId?: unknown } | null)?.openAttemptId
        : null;
    if (typeof open !== 'string' || open === '') throw e;
    await remoteAttempts.abandonAttempt(entry.exerciseId, open);
    return (await remoteAttempts.startAttempt(entry.exerciseId, body, ...timeArg(time))).attemptId;
  }
}

/**
 * How long before the phone's own start an attempt open on the server may have begun and still
 * be taken for that start: the phone opens a local attempt only after the server failed to
 * answer, so a start that reached it anyway is seconds older, never minutes.
 */
const OWN_START_WINDOW_MS = 2 * 60 * 1000;

/**
 * The server attempt a local one is replayed onto (offline plan, B7.1).
 *
 * Joining matters: a start that reached the server before the connection died left an attempt
 * in progress there, and the calls belong on it. But the start also joins an attempt opened on
 * the web and left unfinished — and then the phone's checks land on top of the web's, the
 * author's budget is spent twice, and the replay loses the checks past it. Such an attempt
 * began well before the phone's own start; it is abandoned, as the web does with a stale
 * attempt, and a fresh one is started. The finished work outweighs the unfinished, and the
 * SRS gets the whole of it. An entry from before start times were kept joins, as it did.
 */
async function startForReplay(entry: QueuedSession): Promise<string> {
  const body = { language: entry.language, mode: 'PRACTICE' as const };
  const time = timeArg(replayTime(entry.startedAt));
  const started = await remoteAttempts.startOrJoinAttempt(entry.exerciseId, body, ...time);
  if (!entry.startedAt) return started.attemptId;

  try {
    const row = await remoteAttempts.getAttempt(entry.exerciseId, started.attemptId);
    const openedAt = row.startedAt ? Date.parse(row.startedAt) : NaN;
    const ownStartFrom = Date.parse(entry.startedAt) - OWN_START_WINDOW_MS;
    if (!Number.isFinite(openedAt) || openedAt >= ownStartFrom) return started.attemptId;

    await remoteAttempts.abandonAttempt(entry.exerciseId, started.attemptId);
    console.warn(
      `[ExerciseOutbox] ${entry.exerciseId}: an attempt open since ${row.startedAt} was not ` +
        "this phone's — abandoned, and the replay starts its own.",
    );
    return (await remoteAttempts.startOrJoinAttempt(entry.exerciseId, body, ...time)).attemptId;
  } catch (e) {
    // The server away: the entry waits. Refused — an open board cannot be abandoned — the
    // replay joins it, which is what it did before this check existed.
    if (shouldRetry(e instanceof ApiError ? e.status : null)) throw e;
    return started.attemptId;
  }
}

/**
 * One journalled call, made again on the server attempt — dated when the phone made it. The
 * reveal and the self-check carry no time on the server, so they are sent without one.
 */
async function replay(exerciseId: string, attemptId: string, op: JournalOp): Promise<void> {
  const time = replayTime(op.at);
  switch (op.op) {
    case 'submit':
      await remoteAttempts.submitAttempt(exerciseId, attemptId, op.body, ...timeArg(time));
      return;
    case 'answer':
      await remoteAttempts.answerQuestion(exerciseId, attemptId, op.body, ...timeArg(time));
      return;
    case 'checkRow':
      await remoteAttempts.checkRow(exerciseId, attemptId, op.body, ...timeArg(time));
      return;
    case 'reveal':
      await remoteAttempts.revealAnswers(exerciseId, attemptId);
      return;
    case 'selfCheck':
      await remoteAttempts.selfCheck(exerciseId, attemptId, op.draftAnswer);
      return;
    case 'draft':
      await remoteAttempts.saveDraft(exerciseId, attemptId, op.draftAnswer, ...timeArg(time));
      return;
  }
}

/** The phone's time for a replayed call, or nothing for an entry written before it was kept. */
function replayTime(at: string | undefined): ReplayTime | undefined {
  return at ? { clientAt: at } : undefined;
}

/** `time` as a trailing argument, or none: an undated entry is sent exactly as before. */
function timeArg(time: ReplayTime | undefined): [] | [ReplayTime] {
  return time ? [time] : [];
}

function currentUserId(): string | null {
  return authStore.getState().user?.id ?? null;
}

function withOwner(): { userId?: string } {
  const userId = currentUserId();
  return userId ? { userId } : {};
}

export const exerciseOutboxStore = new ExerciseOutboxStore();
