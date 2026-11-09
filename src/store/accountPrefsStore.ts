import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import {
  getAccountPrefs,
  patchAccountPrefs,
  type AccountPrefs,
  type AccountPrefsPatch,
} from '../api/accountPrefs';
import { ApiError } from '../api/client';
import { shouldRetry } from '../lib/reviewQueue';
import { authStore } from './authStore';

const storage = createAsyncStorage('voxord_account_prefs');
/** Both are kept per learner, so a sign-out never hands one learner's choices to the next. */
const serverKey = (userId: string) => `server:${userId}`;
const pendingKey = (userId: string) => `pending:${userId}`;

/** The goal shown until the learner picks one. */
export const DEFAULT_DAILY_GOAL_MIN = 10;

export const NO_PREFS: AccountPrefs = {
  dailyGoalMin: null,
  translationLanguage: null,
};

export interface AccountPrefsState {
  userId: string | null;
  /** As the learner sees them: the server's last answer with the changes on their way on top. */
  prefs: AccountPrefs;
  /** Changes the server has not taken yet. */
  pending: AccountPrefsPatch;
  lastFetchedAt: number | null;
}

interface Cached {
  prefs: AccountPrefs;
  fetchedAt: number;
}

/**
 * The learner's account-level preferences (mobile redesign 07, step 8): daily goal and
 * translation language, kept on the student profile so every device of the learner shares
 * them.
 *
 * A change is applied at once and kept as a pending patch, one value per field — a newer
 * choice replaces an older one still waiting, so the last write wins. The patch is sent
 * straight away and again with every drain of `sessionSync`; a field leaves it only when the
 * server took the value it still holds (a choice made while the request flew stays). A
 * refusal other than «try later» drops what was sent. The server's answers are always shown
 * with the pending patch on top, so a refresh in between never brings an old value back.
 *
 * Same pattern as `notificationsStore`: listeners, and `getState()` returns the same object
 * until something changes, for `useSyncExternalStore`.
 */
class AccountPrefsStore {
  private userId: string | null = null;
  private server: AccountPrefs = NO_PREFS;
  private lastFetchedAt: number | null = null;
  private pending: AccountPrefsPatch = {};
  /** Bumped on every learner change, so an answer for the previous learner is thrown away. */
  private generation = 0;
  private hydrating: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private state: AccountPrefsState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = this.derive();
    this.syncUser();
    authStore.subscribe(() => this.syncUser());
  }

  /** Never changes anything itself — safe as a `useSyncExternalStore` snapshot. */
  getState(): AccountPrefsState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** What the phone keeps for the signed-in learner, read once per learner. */
  hydrate(): Promise<void> {
    this.syncUser();
    return this.hydrating ?? Promise.resolve();
  }

  /** One field changed: at once on the phone, then on the server. */
  async set<K extends keyof AccountPrefs>(
    key: K,
    value: AccountPrefs[K],
  ): Promise<void> {
    this.syncUser();
    const userId = this.userId;
    if (!userId) return;
    const generation = this.generation;
    await this.hydrating;
    if (generation !== this.generation) return;
    this.pending = { ...this.pending, [key]: value };
    this.notify();
    await this.persist(userId, pendingKey(userId), this.pending);
    this.flush().catch(() => undefined);
  }

  /** For `sessionSync`: what waited goes out, then the server's values come back. */
  async sync(): Promise<void> {
    await this.flush();
    await this.refresh();
  }

  /** The server's values; single-flight. Keeps what the phone has on any failure. */
  refresh(): Promise<void> {
    this.syncUser();
    if (!this.userId) return Promise.resolve();
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Sends the pending patch of the signed-in learner; single-flight. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private syncUser(): void {
    const userId = authStore.getState().user?.id ?? null;
    if (userId === this.userId) return;
    this.userId = userId;
    this.generation += 1;
    this.server = NO_PREFS;
    this.lastFetchedAt = null;
    this.pending = {};
    this.hydrating = userId ? this.readCache(userId, this.generation) : null;
    this.notify();
  }

  private async readCache(userId: string, generation: number): Promise<void> {
    const cached = await this.read<Cached>(serverKey(userId));
    const pending = await this.read<AccountPrefsPatch>(pendingKey(userId));
    if (generation !== this.generation) return;
    // A fetch that landed first is newer than the cache.
    if (cached && this.lastFetchedAt === null) {
      this.server = { ...NO_PREFS, ...cached.prefs };
      this.lastFetchedAt = cached.fetchedAt;
    }
    if (pending) this.pending = { ...pending, ...this.pending };
    this.notify();
  }

  private async doRefresh(): Promise<void> {
    const generation = this.generation;
    const userId = this.userId;
    await this.hydrating;
    if (!userId || generation !== this.generation) return;
    let answer: AccountPrefs;
    try {
      answer = await getAccountPrefs();
    } catch (e) {
      logRefusal('refresh', e);
      return;
    }
    if (generation !== this.generation) return;
    this.server = answer;
    this.lastFetchedAt = Date.now();
    this.notify();
    await this.persist(userId, serverKey(userId), {
      prefs: answer,
      fetchedAt: this.lastFetchedAt,
    } satisfies Cached);
  }

  private async doFlush(): Promise<void> {
    this.syncUser();
    const generation = this.generation;
    const userId = this.userId;
    await this.hydrating;
    if (!userId || generation !== this.generation) return;
    const sent = { ...this.pending };
    if (Object.keys(sent).length === 0) return;

    let answer: AccountPrefs | null = null;
    try {
      answer = await patchAccountPrefs(sent);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : null;
      if (shouldRetry(status)) return;
      // Refused for good (a bad value, not a student): nothing left to send.
      console.warn(`[AccountPrefs] Dropping a change — refused (${status}).`);
    }

    if (generation !== this.generation) {
      // The learner changed meanwhile: settle what is kept for the one who sent it.
      const kept = await this.read<AccountPrefsPatch>(pendingKey(userId));
      if (kept) await this.persist(userId, pendingKey(userId), settle(kept, sent));
      return;
    }
    if (answer) {
      this.server = answer;
      this.lastFetchedAt = Date.now();
    }
    this.pending = settle(this.pending, sent);
    this.notify();
    await this.persist(userId, pendingKey(userId), this.pending);
    if (answer) {
      await this.persist(userId, serverKey(userId), {
        prefs: answer,
        fetchedAt: this.lastFetchedAt!,
      } satisfies Cached);
    }
  }

  private async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn(`[AccountPrefs] Failed to read ${key}:`, e);
      return null;
    }
  }

  private async persist(
    userId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    try {
      await storage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[AccountPrefs] Failed to persist for ${userId}:`, e);
    }
  }

  private derive(): AccountPrefsState {
    return {
      userId: this.userId,
      prefs: applyPending(this.server, this.pending),
      pending: this.pending,
      lastFetchedAt: this.lastFetchedAt,
    };
  }

  private notify(): void {
    this.state = this.derive();
    this.listeners.forEach(l => l());
  }
}

function logRefusal(what: string, e: unknown): void {
  const status = e instanceof ApiError ? e.status : null;
  // Out of reach is the normal offline case; anything else is worth a line.
  if (status !== null) console.warn(`[AccountPrefs] ${what} refused (${status}).`);
}

// ── pure parts, exported for tests ───────────────────────────────────────

/** The server's values with the changes on their way on top. */
export function applyPending(
  server: AccountPrefs,
  pending: AccountPrefsPatch,
): AccountPrefs {
  return { ...server, ...pending };
}

/**
 * What still waits once `sent` was taken: a field leaves only if it still holds the value
 * sent — one changed again meanwhile goes out on the next flush.
 */
export function settle(
  pending: AccountPrefsPatch,
  sent: AccountPrefsPatch,
): AccountPrefsPatch {
  const left: AccountPrefsPatch = { ...pending };
  for (const key of Object.keys(sent) as (keyof AccountPrefs)[]) {
    if (key in left && left[key] === sent[key]) delete left[key];
  }
  return left;
}

export const accountPrefsStore = new AccountPrefsStore();
