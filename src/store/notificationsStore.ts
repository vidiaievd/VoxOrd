import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import { isServerOutOfReach } from '../api/isNetworkError';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationFilter,
  type NotificationItem,
  type NotificationsPage,
} from '../api/notifications';
import { isOwnedBy, shouldRetry } from '../lib/reviewQueue';
import { authStore } from './authStore';

const storage = createAsyncStorage('voxord_notifications');
const OUTBOX_KEY = 'outbox';
/** The feed is kept per learner, so a sign-out never shows one learner's feed to the next. */
const feedKey = (userId: string) => `feed:${userId}`;

/** What the cache keeps of the feed: the newest first page or two. */
export const CACHED_ITEMS = 100;

/** A read the server has not heard of yet; both calls are idempotent there. */
export type ReadEntry =
  | { kind: 'read'; id: string; userId: string }
  /** `at`: when the learner pressed it — what arrived later stays unread on the phone. */
  | { kind: 'readAll'; at: string; userId: string };

interface Feed {
  items: NotificationItem[];
  nextCursor: string | null;
  /** The server's count — hidden types included. */
  serverUnread: number;
  /** Unread rows of hidden types seen in the loaded pages; subtracted from the badge. */
  hiddenUnreadIds: string[];
  lastFetchedAt: number | null;
}

export type FeedStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NotificationsState {
  userId: string | null;
  /** Newest first, with reads still on their way to the server applied. */
  items: NotificationItem[];
  /** The tab badge's number: the server's, less hidden types and reads still on their way. */
  unreadCount: number;
  hasMore: boolean;
  /**
   * The first page: `loading` only with nothing to show yet; `error` only when it failed with
   * nothing cached. A refresh over a cache stays `ready`.
   */
  status: FeedStatus;
  /** The last fetch could not reach the server — the screen shows what it keeps. */
  offline: boolean;
  refreshing: boolean;
  /** The next page: `error` turns the footer into «Load more». */
  pageStatus: 'idle' | 'loading' | 'error';
  lastFetchedAt: number | null;
  /** The screen's segment — kept here so Back from a submission finds it as it was. */
  filter: NotificationFilter;
}

const EMPTY_FEED: Feed = {
  items: [],
  nextCursor: null,
  serverUnread: 0,
  hiddenUnreadIds: [],
  lastFetchedAt: null,
};

/**
 * The learner's notification feed (mobile redesign 06, step 2; Notifications §8): the cached
 * feed of the signed-in learner, its pages and its unread count, and the reads the server has
 * not heard of yet.
 *
 * A read is applied at once and queued; the queue is sent straight away and again with every
 * drain of `sessionSync` until the server takes it. A refusal (the notification is gone) drops
 * it — the item stays read on the phone. «Mark all read» replaces the learner's queued reads.
 * The server's answers are always shown with the queue applied on top, so a refresh in between
 * never brings an unread dot back.
 *
 * Same pattern as `settingsStore`: a class with listeners; `getState()` returns the same object
 * until something changes, for `useSyncExternalStore`.
 */
class NotificationsStore {
  private userId: string | null = null;
  private feed: Feed = EMPTY_FEED;
  private outbox: ReadEntry[] = [];
  private outboxLoaded = false;
  private status: FeedStatus = 'idle';
  private offline = false;
  private refreshing: Promise<void> | null = null;
  private paging: Promise<void> | null = null;
  private pageStatus: NotificationsState['pageStatus'] = 'idle';
  private filter: NotificationFilter = 'all';
  private flushing: Promise<void> | null = null;
  /** Bumped on every learner change, so an answer for the previous learner is thrown away. */
  private generation = 0;
  private hydrating: Promise<void> | null = null;
  private state: NotificationsState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = this.derive();
    this.syncUser();
    authStore.subscribe(() => this.syncUser());
  }

  /** Never changes anything itself — safe as a `useSyncExternalStore` snapshot. */
  getState(): NotificationsState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setFilter(filter: NotificationFilter): void {
    if (filter === this.filter) return;
    this.filter = filter;
    this.notify();
  }

  /** The cache of the signed-in learner, read once per learner. */
  hydrate(): Promise<void> {
    this.syncUser();
    return this.hydrating ?? Promise.resolve();
  }

  /** The first page again; single-flight. Keeps the cache on any failure. */
  refresh(): Promise<void> {
    this.syncUser();
    if (!this.userId) return Promise.resolve();
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
        this.notify();
      });
      this.notify();
    }
    return this.refreshing;
  }

  /** A refresh when the feed is older than `maxAgeMs` (tab focus, coming back to the app). */
  refreshIfStale(maxAgeMs: number, now: number = Date.now()): Promise<void> {
    const at = this.feed.lastFetchedAt;
    if (at !== null && now - at < maxAgeMs) return Promise.resolve();
    return this.refresh();
  }

  /** The next page, if there is one; single-flight. */
  loadMore(): Promise<void> {
    this.syncUser();
    const cursor = this.feed.nextCursor;
    if (!this.userId || !cursor || this.paging)
      return this.paging ?? Promise.resolve();
    this.pageStatus = 'loading';
    this.notify();
    this.paging = this.doLoadMore(cursor).finally(() => {
      this.paging = null;
    });
    return this.paging;
  }

  /** One item read: at once on the phone, then on the server. */
  async markRead(id: string): Promise<void> {
    this.syncUser();
    const userId = this.userId;
    if (!userId) return;
    await this.loadOutbox();
    const covered = this.outbox.some(
      e => e.userId === userId && (e.kind === 'readAll' || e.id === id),
    );
    const item = this.feed.items.find(n => n.id === id);
    if (covered || !item || item.read) return;
    this.outbox = [...this.outbox, { kind: 'read', id, userId }];
    await this.persistOutbox();
    this.flush().catch(() => undefined);
  }

  /**
   * Everything read: at once on the phone, then on the server. «Everything» is up to the newest
   * item the learner has — a server time, so a phone clock that runs ahead cannot swallow a
   * notification that arrives meanwhile (backend step 6d). With nothing loaded, the press time.
   */
  async markAllRead(now: Date = new Date()): Promise<void> {
    this.syncUser();
    const userId = this.userId;
    if (!userId) return;
    await this.loadOutbox();
    const newest = this.feed.items.reduce<string | null>(
      (at, n) => (at === null || n.createdAt > at ? n.createdAt : at),
      null,
    );
    this.outbox = [
      ...this.outbox.filter(e => e.userId !== userId),
      { kind: 'readAll', at: newest ?? now.toISOString(), userId },
    ];
    await this.persistOutbox();
    this.flush().catch(() => undefined);
  }

  /** Sends the signed-in learner's queued reads, oldest first; stops at the first that must wait. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  /** Reads of the signed-in learner still waiting for the server. */
  get pendingCount(): number {
    return this.outbox.filter(e => isOwnedBy(e.userId, this.userId)).length;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private syncUser(): void {
    const userId = authStore.getState().user?.id ?? null;
    if (userId === this.userId) return;
    this.userId = userId;
    this.generation += 1;
    this.feed = EMPTY_FEED;
    this.status = 'idle';
    this.offline = false;
    this.pageStatus = 'idle';
    this.filter = 'all';
    this.hydrating = userId ? this.readCache(userId, this.generation) : null;
    this.notify();
  }

  private async readCache(userId: string, generation: number): Promise<void> {
    await this.loadOutbox();
    let cached: Feed | null = null;
    try {
      const raw = await storage.getItem(feedKey(userId));
      if (raw)
        cached = { ...EMPTY_FEED, ...(JSON.parse(raw) as Partial<Feed>) };
    } catch (e) {
      console.warn('[Notifications] Failed to read the cache:', e);
    }
    // A fetch that landed first is newer than the cache.
    if (
      generation !== this.generation ||
      !cached ||
      this.feed.lastFetchedAt !== null
    )
      return;
    this.feed = cached;
    if (this.status !== 'ready') this.status = 'ready';
    this.notify();
  }

  private async doRefresh(): Promise<void> {
    const generation = this.generation;
    await this.hydrating;
    if (this.status !== 'ready') this.status = 'loading';
    this.notify();
    let page: NotificationsPage;
    try {
      page = await getNotifications();
    } catch (e) {
      if (generation !== this.generation) return;
      this.offline = isServerOutOfReach(e);
      if (this.status !== 'ready') this.status = 'error';
      return;
    }
    if (generation !== this.generation) return;
    this.feed = mergeFirstPage(this.feed, page, Date.now());
    this.status = 'ready';
    this.offline = false;
    this.pageStatus = 'idle';
    await this.persistFeed();
    // Back in reach: whatever reads waited go out now.
    if (this.pendingCount > 0) this.flush().catch(() => undefined);
  }

  private async doLoadMore(cursor: string): Promise<void> {
    const generation = this.generation;
    try {
      const page = await getNotifications(cursor);
      if (generation !== this.generation) return;
      this.feed = appendPage(this.feed, page);
      this.pageStatus = 'idle';
      await this.persistFeed();
    } catch {
      if (generation !== this.generation) return;
      this.pageStatus = 'error';
      this.notify();
    }
  }

  private async doFlush(): Promise<void> {
    await this.loadOutbox();
    const userId = this.userId;
    if (!userId) return;
    const settled = new Set<ReadEntry>();
    for (const entry of [...this.outbox]) {
      if (entry.userId !== userId) continue;
      try {
        if (entry.kind === 'read') await markNotificationRead(entry.id);
        else await markAllNotificationsRead(entry.at);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        if (shouldRetry(status)) break;
        // Gone on the server, or not this learner's: nothing left to mark.
        console.warn(
          `[Notifications] Dropping a ${entry.kind} — refused (${status}).`,
        );
      }
      settled.add(entry);
      if (userId === this.userId) this.feed = confirmRead(this.feed, entry);
    }
    if (settled.size === 0) return;
    this.outbox = this.outbox.filter(e => !settled.has(e));
    await this.persistOutbox();
    if (userId === this.userId) await this.persistFeed();
  }

  private async loadOutbox(): Promise<void> {
    if (this.outboxLoaded) return;
    try {
      const raw = await storage.getItem(OUTBOX_KEY);
      if (raw && !this.outboxLoaded)
        this.outbox = [...(JSON.parse(raw) as ReadEntry[]), ...this.outbox];
    } catch (e) {
      console.warn('[Notifications] Failed to read the outbox:', e);
    }
    this.outboxLoaded = true;
  }

  private async persistOutbox(): Promise<void> {
    this.notify();
    try {
      await storage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox));
    } catch (e) {
      console.warn('[Notifications] Failed to persist the outbox:', e);
    }
  }

  private async persistFeed(): Promise<void> {
    this.notify();
    const userId = this.userId;
    if (!userId) return;
    try {
      await storage.setItem(
        feedKey(userId),
        JSON.stringify(trimForCache(this.feed)),
      );
    } catch (e) {
      console.warn('[Notifications] Failed to persist the cache:', e);
    }
  }

  private derive(): NotificationsState {
    const pending = this.outbox.filter(e => e.userId === this.userId);
    const { items, unreadCount } = applyPending(this.feed, pending);
    return {
      userId: this.userId,
      items,
      unreadCount,
      hasMore: this.feed.nextCursor !== null,
      status: this.status,
      offline: this.offline,
      refreshing: this.refreshing !== null,
      pageStatus: this.pageStatus,
      lastFetchedAt: this.feed.lastFetchedAt,
      filter: this.filter,
    };
  }

  private notify(): void {
    this.state = this.derive();
    this.listeners.forEach(l => l());
  }
}

// ── pure parts, exported for tests ───────────────────────────────────────

const newestFirst = (a: NotificationItem, b: NotificationItem) =>
  b.createdAt.localeCompare(a.createdAt);

/**
 * A fresh first page over what is loaded. Older pages stay when the fresh one reaches them;
 * when it does not (more arrived than a page holds), the gap would be invisible, so they go.
 */
export function mergeFirstPage(
  feed: Feed,
  page: NotificationsPage,
  now: number,
): Feed {
  const fresh = new Set(page.items.map(n => n.id));
  const older = feed.items.filter(n => !fresh.has(n.id));
  const reaches =
    page.nextCursor === null ||
    feed.items.length === 0 ||
    page.items.some(n => feed.items.some(o => o.id === n.id));
  const keepOlder = reaches && page.nextCursor !== null ? older : [];
  const hiddenOlder = keepOlder.length > 0 ? feed.hiddenUnreadIds : [];
  return {
    items: [...page.items, ...keepOlder].sort(newestFirst),
    nextCursor: keepOlder.length > 0 ? feed.nextCursor : page.nextCursor,
    serverUnread: page.unreadCount,
    hiddenUnreadIds: [...new Set([...page.hiddenUnreadIds, ...hiddenOlder])],
    lastFetchedAt: now,
  };
}

/** The next page under what is loaded, deduplicated by id. */
export function appendPage(feed: Feed, page: NotificationsPage): Feed {
  const known = new Set(feed.items.map(n => n.id));
  return {
    ...feed,
    items: [...feed.items, ...page.items.filter(n => !known.has(n.id))].sort(
      newestFirst,
    ),
    nextCursor: page.nextCursor,
    serverUnread: page.unreadCount,
    hiddenUnreadIds: [
      ...new Set([...feed.hiddenUnreadIds, ...page.hiddenUnreadIds]),
    ],
  };
}

/** The server has taken a read: the feed says so until the next page confirms it. */
export function confirmRead(feed: Feed, entry: ReadEntry): Feed {
  if (entry.kind === 'readAll') {
    // The server read up to `at` (backend step 6d). Loaded rows after it stay unread; hidden
    // ones are forgotten — the next page brings back any that came later.
    const at = entry.at;
    const items = feed.items.map(n =>
      n.read || n.createdAt > at ? n : { ...n, read: true },
    );
    return {
      ...feed,
      items,
      serverUnread: items.filter(n => !n.read).length,
      hiddenUnreadIds: [],
    };
  }
  const item = feed.items.find(n => n.id === entry.id);
  if (!item || item.read) return feed;
  return {
    ...feed,
    items: feed.items.map(n => (n.id === entry.id ? { ...n, read: true } : n)),
    serverUnread: Math.max(0, feed.serverUnread - 1),
  };
}

/** The feed as the learner sees it: the server's answer with the queued reads on top. */
export function applyPending(
  feed: Feed,
  pending: readonly ReadEntry[],
): { items: NotificationItem[]; unreadCount: number } {
  const readAllAt = pending.reduce<string | null>(
    (at, e) => (e.kind === 'readAll' && (at === null || e.at > at) ? e.at : at),
    null,
  );
  const readIds = new Set(
    pending.flatMap(e => (e.kind === 'read' ? [e.id] : [])),
  );
  const isRead = (n: NotificationItem) =>
    n.read ||
    readIds.has(n.id) ||
    (readAllAt !== null && n.createdAt <= readAllAt);

  let unreadCount: number;
  if (readAllAt !== null) {
    // Everything up to the press is read; what is unread is what is loaded and came after.
    unreadCount = feed.items.filter(n => !isRead(n)).length;
  } else {
    const justRead = feed.items.filter(
      n => !n.read && readIds.has(n.id),
    ).length;
    unreadCount = feed.serverUnread - feed.hiddenUnreadIds.length - justRead;
  }
  const items =
    readIds.size === 0 && readAllAt === null
      ? feed.items
      : feed.items.map(n => (!n.read && isRead(n) ? { ...n, read: true } : n));
  return { items, unreadCount: Math.max(0, unreadCount) };
}

/** The first `CACHED_ITEMS`; the next page then starts after the last one kept. */
export function trimForCache(feed: Feed): Feed {
  if (feed.items.length <= CACHED_ITEMS) return feed;
  const items = feed.items.slice(0, CACHED_ITEMS);
  return { ...feed, items, nextCursor: items[items.length - 1].id };
}

export type { Feed as NotificationsFeed };

export const notificationsStore = new NotificationsStore();
