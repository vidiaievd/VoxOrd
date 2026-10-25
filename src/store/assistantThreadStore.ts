import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import type { AssistAnswer, AssistTurn } from '../api/assistant';
import { authStore } from './authStore';

/**
 * The learner's conversations with the assistant (mobile redesign 03, step 1; plan 83 Q1 = A).
 *
 * The server keeps nothing between turns, so the thread lives here: one per context (a unit,
 * a submission, a class, a free question), the newest `TURNS_KEPT` turns of each, the newest
 * `THREADS_KEPT` threads. The phone sends the tail of it with every question
 * (`historyToSend`).
 *
 * Learner texts are kept for their own learner only: one storage key per user, read only in
 * that user's session; every thread goes at sign-out, and threads of anyone but the
 * signed-in learner are dropped when a session starts (a sign-out the app did not live to
 * see — killed mid-way — leaves nothing behind for the next learner).
 */
const storage = createAsyncStorage('voxord_assistant');

export const TURNS_KEPT = 30;
export const THREADS_KEPT = 20;

export interface ThreadTurn {
  /** Local id, for the screen's list and the feedback mark. */
  id: string;
  role: 'user' | 'assistant';
  /** The learner's words, or the answer's blocks joined — what goes back as history. */
  text: string;
  /** The assistant's answer as it came, for drawing citations and suggestions again. */
  answer?: AssistAnswer;
  /** «Helpful / not helpful», once given. */
  feedback?: 'helpful' | 'not_helpful';
  at: string;
}

interface StoredThread {
  updatedAt: string;
  turns: ThreadTurn[];
}

type UserThreads = Record<string, StoredThread>;

function currentUserId(): string | null {
  const { status, user } = authStore.getState();
  return status === 'signedIn' && user ? user.id : null;
}

/** The answer as one text, the way it goes back to the server as history. */
export function answerText(answer: AssistAnswer): string {
  return answer.blocks.map((b) => b.text).join('\n');
}

export function toHistory(turns: readonly ThreadTurn[]): AssistTurn[] {
  return turns.map((t) => ({ role: t.role, text: t.text }));
}

function parseThreads(raw: string | null): UserThreads {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as UserThreads)
      : {};
  } catch {
    return {};
  }
}

/** The newest threads only, each to its newest turns. */
export function capThreads(threads: UserThreads): UserThreads {
  const kept = Object.entries(threads)
    .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, THREADS_KEPT)
    .map(([key, t]) => [key, { ...t, turns: t.turns.slice(-TURNS_KEPT) }] as const);
  return Object.fromEntries(kept);
}

class AssistantThreadStore {
  /** Writes go one after another, so two quick turns cannot overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve();
  private started = false;
  private lastUserId: string | null = null;

  /** Ties the threads to the session: wired once at app start. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.onAuthChange();
    authStore.subscribe(() => this.onAuthChange());
  }

  async getThread(contextKey: string): Promise<ThreadTurn[]> {
    const userId = currentUserId();
    if (!userId) return [];
    await this.queue;
    const threads = parseThreads(await this.read(userId));
    return threads[contextKey]?.turns ?? [];
  }

  /** Adds turns to the end of a thread, keeping the newest. */
  append(contextKey: string, turns: readonly ThreadTurn[]): Promise<void> {
    return this.update(contextKey, (current) => [...current, ...turns]);
  }

  setFeedback(contextKey: string, turnId: string, helpful: boolean): Promise<void> {
    return this.update(contextKey, (current) =>
      current.map((t) =>
        t.id === turnId ? { ...t, feedback: helpful ? 'helpful' : 'not_helpful' } : t,
      ),
    );
  }

  clearThread(contextKey: string): Promise<void> {
    return this.update(contextKey, () => []);
  }

  /** Every learner's threads, gone. */
  clearAll(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await storage.clear();
      } catch (e) {
        console.warn('[AssistantThreads] Failed to clear:', e);
      }
    });
  }

  private update(
    contextKey: string,
    change: (turns: ThreadTurn[]) => ThreadTurn[],
  ): Promise<void> {
    const userId = currentUserId();
    if (!userId) return Promise.resolve();
    return this.enqueue(async () => {
      const threads = parseThreads(await this.read(userId));
      const turns = change(threads[contextKey]?.turns ?? []);
      if (turns.length === 0) delete threads[contextKey];
      else threads[contextKey] = { updatedAt: new Date().toISOString(), turns };
      try {
        await storage.setItem(userId, JSON.stringify(capThreads(threads)));
      } catch (e) {
        // The conversation goes on on screen; it is only not remembered.
        console.warn('[AssistantThreads] Failed to save:', e);
      }
    });
  }

  private async read(userId: string): Promise<string | null> {
    try {
      return await storage.getItem(userId);
    } catch {
      return null;
    }
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private onAuthChange(): void {
    const { status, user } = authStore.getState();
    if (status === 'signedOut') {
      if (this.lastUserId !== null) void this.clearAll();
      this.lastUserId = null;
    } else if (status === 'signedIn' && user && user.id !== this.lastUserId) {
      this.lastUserId = user.id;
      void this.dropOthers(user.id);
    }
  }

  private dropOthers(userId: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        const others = (await storage.getAllKeys()).filter((k) => k !== userId);
        if (others.length > 0) await storage.removeMany(others);
      } catch (e) {
        console.warn('[AssistantThreads] Failed to drop other learners’ threads:', e);
      }
    });
  }
}

export const assistantThreadStore = new AssistantThreadStore();
