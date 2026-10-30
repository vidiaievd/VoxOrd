import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  matchesFilter,
  type NotificationFilter,
  type NotificationItem,
} from '../api/notifications';
import {
  notificationsStore,
  type NotificationsState,
} from '../store/notificationsStore';

const subscribe = (listener: () => void) =>
  notificationsStore.subscribe(listener);
const snapshot = () => notificationsStore.getState();

/** The whole store state — for the hooks below. */
export function useNotificationsState(): NotificationsState {
  return useSyncExternalStore(subscribe, snapshot);
}

export interface UseNotifications extends Omit<NotificationsState, 'items'> {
  /** The feed under the current segment, newest first. */
  items: NotificationItem[];
  /** Whether the whole feed is empty — «No notifications yet» vs «Nothing here yet». */
  feedEmpty: boolean;
  setFilter: (filter: NotificationFilter) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * The Notifications screen's feed (Notifications §8). The segment lives in the store, so it
 * survives leaving the tab and Back from a submission; the screen filters the loaded feed.
 */
export function useNotifications(): UseNotifications {
  const state = useNotificationsState();
  const all = state.items;
  const items = useMemo(
    () => all.filter(n => matchesFilter(n, state.filter)),
    [all, state.filter],
  );
  const setFilter = useCallback(
    (filter: NotificationFilter) => notificationsStore.setFilter(filter),
    [],
  );
  const refresh = useCallback(() => notificationsStore.refresh(), []);
  const loadMore = useCallback(() => notificationsStore.loadMore(), []);
  const markRead = useCallback(
    (id: string) => notificationsStore.markRead(id),
    [],
  );
  const markAllRead = useCallback(() => notificationsStore.markAllRead(), []);
  return {
    ...state,
    items,
    feedEmpty: all.length === 0,
    setFilter,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  };
}
