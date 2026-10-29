import type { ApiError as ApiErrorType } from '../api/client';
import { sampleNotificationsPage } from '../api/__fixtures__/notificationsSample';
import type { NotificationsPage } from '../api/notifications';

/** In-memory stand-in for the device's async storage; survives a module reset (an app restart). */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: (ns: string) => ({
    getItem: async (key: string) => mockStorage.get(`${ns}/${key}`) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(`${ns}/${key}`, value);
    },
  }),
}));

jest.mock('../api/notifications', () => ({
  ...jest.requireActual('../api/notifications'),
  getNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

type Api = typeof import('../api/notifications');
type Store = typeof import('./notificationsStore');
type Auth = typeof import('./authStore');

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };
const now = new Date('2026-10-29T12:00:00.000Z');

/** The client the store sees — a fresh one after every module reset, so `instanceof` holds. */
let ApiError: typeof ApiErrorType;
const offline = () =>
  new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

/** The sample page as the adapter reads it: 6 rows shown, 3 unread hidden, server count 5. */
function samplePage(): NotificationsPage {
  const { parseNotificationsPage } = jest.requireActual<Api>(
    '../api/notifications',
  );
  return parseNotificationsPage(sampleNotificationsPage(now))!;
}

let api: jest.Mocked<Api>;
let store: Store['notificationsStore'];
let auth: Auth['authStore'];

/** A fresh app over the same device storage. */
function boot(user: typeof LEARNER | null = LEARNER) {
  jest.resetModules();
  api = require('../api/notifications');
  ApiError = require('../api/client').ApiError;
  auth = require('./authStore').authStore;
  if (user) auth.setSignedIn(user);
  store = require('./notificationsStore').notificationsStore;
}

const flushAsync = () => new Promise<void>(r => setImmediate(() => r()));

let warn: jest.SpyInstance;
beforeEach(() => {
  mockStorage.clear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  boot();
  api.getNotifications.mockResolvedValue(samplePage());
  api.markNotificationRead.mockResolvedValue(undefined);
  api.markAllNotificationsRead.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('loading', () => {
  it('starts idle, loads the first page and badges what the learner can see', async () => {
    expect(store.getState().status).toBe('idle');
    let answer!: (p: NotificationsPage) => void;
    api.getNotifications.mockReturnValueOnce(new Promise(r => (answer = r)));
    const loading = store.refresh();
    await flushAsync();
    expect(store.getState()).toMatchObject({
      status: 'loading',
      refreshing: true,
    });
    answer(samplePage());
    await loading;

    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.items).toHaveLength(6);
    // 5 on the server, of which the nudge and the teacher row are hidden… and the odd
    // outcome — 3 hidden unread; the learner sees 2 unread rows.
    expect(s.unreadCount).toBe(2);
    expect(s.hasMore).toBe(true);
    expect(s.lastFetchedAt).not.toBeNull();
  });

  it('shows the cache after a restart before anything is fetched', async () => {
    await store.refresh();
    boot();
    await store.hydrate();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().items).toHaveLength(6);
    expect(api.getNotifications).not.toHaveBeenCalled();
  });

  it('is an error without a cache, and keeps the cache with the offline flag on a network error', async () => {
    api.getNotifications.mockRejectedValueOnce(offline());
    await store.refresh();
    expect(store.getState()).toMatchObject({ status: 'error', offline: true });

    await store.refresh();
    api.getNotifications.mockRejectedValueOnce(offline());
    await store.refresh();
    expect(store.getState()).toMatchObject({ status: 'ready', offline: true });
    expect(store.getState().items).toHaveLength(6);

    await store.refresh();
    expect(store.getState().offline).toBe(false);
  });

  it('a refusal is not offline', async () => {
    api.getNotifications.mockRejectedValueOnce(
      new ApiError({ message: 'no', status: 403 }),
    );
    await store.refresh();
    expect(store.getState()).toMatchObject({ status: 'error', offline: false });
  });

  it('refreshes only when stale', async () => {
    await store.refresh();
    const at = store.getState().lastFetchedAt!;
    await store.refreshIfStale(60_000, at + 30_000);
    expect(api.getNotifications).toHaveBeenCalledTimes(1);
    await store.refreshIfStale(60_000, at + 61_000);
    expect(api.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('pages on, deduplicating by id, and turns a failed page into «load more»', async () => {
    await store.refresh();
    const extra = {
      ...samplePage().items[0],
      id: 'n-older',
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    api.getNotifications.mockRejectedValueOnce(offline());
    await store.loadMore();
    expect(store.getState().pageStatus).toBe('error');

    api.getNotifications.mockResolvedValueOnce({
      items: [samplePage().items[1], extra],
      nextCursor: null,
      unreadCount: 6,
      hiddenUnreadIds: [],
    });
    await store.loadMore();
    expect(api.getNotifications).toHaveBeenLastCalledWith('n-odd-outcome');
    const s = store.getState();
    expect(s.pageStatus).toBe('idle');
    expect(s.items.map(n => n.id)).toHaveLength(7);
    expect(s.items[6].id).toBe('n-older');
    expect(s.hasMore).toBe(false);
  });

  it('keeps older pages under a fresh first page that reaches them, drops them across a gap', async () => {
    const page = samplePage();
    await store.refresh();
    const older = {
      ...page.items[0],
      id: 'n-older',
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    api.getNotifications.mockResolvedValueOnce({
      ...page,
      items: [older],
      nextCursor: 'c-2',
    });
    await store.loadMore();

    const newer = {
      ...page.items[0],
      id: 'n-new',
      createdAt: '2026-10-29T11:59:00.000Z',
    };
    api.getNotifications.mockResolvedValueOnce({
      ...page,
      items: [newer, ...page.items.slice(0, 2)],
    });
    await store.refresh();
    expect(store.getState().items.map(n => n.id)).toContain('n-older');
    expect(store.getState().items[0].id).toBe('n-new');

    // A first page with no row in common: what lay below it can no longer be reached in order.
    api.getNotifications.mockResolvedValueOnce({
      ...page,
      items: [{ ...newer, id: 'n-x' }],
      nextCursor: 'c-9',
    });
    await store.refresh();
    expect(store.getState().items.map(n => n.id)).toEqual(['n-x']);
    expect(store.getState().hasMore).toBe(true);
  });
});

describe('reads', () => {
  it('marks one read at once and on the server', async () => {
    await store.refresh();
    await store.markRead('n-passed');
    const s = store.getState();
    expect(s.items.find(n => n.id === 'n-passed')!.read).toBe(true);
    expect(s.unreadCount).toBe(1);
    await store.flush();
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-passed');
    expect(store.pendingCount).toBe(0);
    expect(store.getState().unreadCount).toBe(1);
  });

  it('ignores a read of something already read', async () => {
    await store.refresh();
    await store.markRead('n-class');
    await store.flush();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('keeps a read made offline, across a refresh and a restart, and sends it on reconnect', async () => {
    await store.refresh();
    api.markNotificationRead.mockRejectedValue(offline());
    await store.markRead('n-passed');
    await store.flush();
    expect(store.pendingCount).toBe(1);

    // The server still says unread; the phone keeps the dot off.
    await store.refresh();
    expect(store.getState().items.find(n => n.id === 'n-passed')!.read).toBe(
      true,
    );
    expect(store.getState().unreadCount).toBe(1);

    boot();
    api.markNotificationRead.mockResolvedValue(undefined);
    await store.hydrate();
    expect(store.getState().items.find(n => n.id === 'n-passed')!.read).toBe(
      true,
    );
    expect(store.pendingCount).toBe(1);
    await store.flush();
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-passed');
    expect(store.pendingCount).toBe(0);
  });

  it('drops a read the server refuses; the item stays read', async () => {
    await store.refresh();
    api.markNotificationRead.mockRejectedValue(
      new ApiError({ message: 'gone', status: 404 }),
    );
    await store.markRead('n-passed');
    await store.flush();
    expect(store.pendingCount).toBe(0);
    expect(store.getState().items.find(n => n.id === 'n-passed')!.read).toBe(
      true,
    );
  });

  it('marks all read at once, replacing queued reads, and clears hidden unread too', async () => {
    await store.refresh();
    api.markNotificationRead.mockRejectedValue(offline());
    api.markAllNotificationsRead.mockRejectedValue(offline());
    await store.markRead('n-passed');
    await store.flush();
    await store.markAllRead(now);
    expect(store.pendingCount).toBe(1);
    expect(store.getState().unreadCount).toBe(0);
    expect(store.getState().items.every(n => n.read)).toBe(true);

    // Arrived after the press: unread on the phone until the server is reached.
    const later = {
      ...samplePage().items[0],
      id: 'n-later',
      read: false,
      createdAt: '2026-10-29T12:05:00.000Z',
    };
    api.getNotifications.mockResolvedValueOnce({
      ...samplePage(),
      items: [later, ...samplePage().items],
    });
    await store.refresh();
    expect(store.getState().unreadCount).toBe(1);

    api.markAllNotificationsRead.mockResolvedValue(undefined);
    await store.flush();
    // The queued single read was replaced, never sent; read-all went out once it could.
    expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(api.markAllNotificationsRead).toHaveBeenLastCalledWith();
    expect(store.pendingCount).toBe(0);
    expect(store.getState().unreadCount).toBe(0);
  });
});

describe('learners', () => {
  it('never shows one learner’s feed to the next, and sends reads only as their own', async () => {
    await store.refresh();
    api.markNotificationRead.mockRejectedValue(offline());
    await store.markRead('n-passed');
    await store.flush();

    auth.setSignedOut();
    expect(store.getState()).toMatchObject({
      userId: null,
      items: [],
      unreadCount: 0,
      status: 'idle',
    });

    auth.setSignedIn(OTHER);
    await store.hydrate();
    expect(store.getState().items).toEqual([]);
    api.markNotificationRead.mockResolvedValue(undefined);
    api.markNotificationRead.mockClear();
    await store.flush();
    expect(api.markNotificationRead).not.toHaveBeenCalled();

    auth.setSignedIn(LEARNER);
    await store.hydrate();
    expect(store.getState().items).toHaveLength(6);
    await store.flush();
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-passed');
  });

  it('throws away an answer for the learner who signed out meanwhile', async () => {
    let answer!: (p: NotificationsPage) => void;
    api.getNotifications.mockReturnValueOnce(new Promise(r => (answer = r)));
    const pending = store.refresh();
    await flushAsync();
    auth.setSignedIn(OTHER);
    answer(samplePage());
    await pending;
    expect(store.getState().items).toEqual([]);
    expect(mockStorage.has('voxord_notifications/feed:user-2')).toBe(false);
  });

  it('resets the segment for a new learner', () => {
    store.setFilter('work');
    expect(store.getState().filter).toBe('work');
    auth.setSignedIn(OTHER);
    expect(store.getState().filter).toBe('all');
  });
});

describe('cache', () => {
  it('keeps the first 100 and pages on after the last one kept', async () => {
    const base = samplePage().items[0];
    const items = Array.from({ length: 120 }, (_, i) => ({
      ...base,
      id: `n-${String(i).padStart(3, '0')}`,
      createdAt: new Date(now.getTime() - i * 60_000).toISOString(),
    }));
    api.getNotifications.mockResolvedValueOnce({
      items,
      nextCursor: 'n-119',
      unreadCount: 120,
      hiddenUnreadIds: [],
    });
    await store.refresh();
    const cached = JSON.parse(
      mockStorage.get('voxord_notifications/feed:user-1')!,
    );
    expect(cached.items).toHaveLength(100);
    expect(cached.nextCursor).toBe('n-099');
    expect(warn).not.toHaveBeenCalled();
  });
});
