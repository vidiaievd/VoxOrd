import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import type { LocalAttempt } from './attempt';

const storage = createAsyncStorage('voxord_local_attempts');
const KEY = 'attempts';

/** Kept per exercise and learner: enough to resume, and a history the bodies read. */
const KEEP_PER_EXERCISE = 5;

/**
 * Local attempts, on the phone's storage so they survive the app being killed — a set half
 * answered offline resumes where it was, as an engine attempt does after a reload.
 */
export class LocalAttemptStore {
  private attempts: Record<string, LocalAttempt> | null = null;
  private loading: Promise<Record<string, LocalAttempt>> | null = null;

  async get(id: string): Promise<LocalAttempt | null> {
    const found = (await this.load())[id];
    return found ? (JSON.parse(JSON.stringify(found)) as LocalAttempt) : null;
  }

  async put(attempt: LocalAttempt): Promise<void> {
    const all = { ...(await this.load()), [attempt.id]: attempt };
    this.attempts = prune(all, attempt);
    try {
      await storage.setItem(KEY, JSON.stringify(this.attempts));
    } catch (e) {
      console.warn('[LocalAttempts] Failed to persist:', e);
    }
  }

  async listFor(userId: string, exerciseId: string): Promise<LocalAttempt[]> {
    return Object.values(await this.load())
      .filter(a => a.userId === userId && a.exerciseId === exerciseId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(a => JSON.parse(JSON.stringify(a)) as LocalAttempt);
  }

  private load(): Promise<Record<string, LocalAttempt>> {
    if (this.attempts) return Promise.resolve(this.attempts);
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const raw = await storage.getItem(KEY);
          this.attempts = raw ? (JSON.parse(raw) as Record<string, LocalAttempt>) : {};
        } catch {
          this.attempts = {};
        }
        return this.attempts;
      })();
    }
    return this.loading;
  }
}

/** Drops the oldest attempts at the same exercise beyond `KEEP_PER_EXERCISE`. */
function prune(
  all: Record<string, LocalAttempt>,
  latest: LocalAttempt,
): Record<string, LocalAttempt> {
  const siblings = Object.values(all)
    .filter(a => a.userId === latest.userId && a.exerciseId === latest.exerciseId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const drop = new Set(siblings.slice(KEEP_PER_EXERCISE).map(a => a.id));
  if (drop.size === 0) return all;
  return Object.fromEntries(Object.entries(all).filter(([id]) => !drop.has(id)));
}
