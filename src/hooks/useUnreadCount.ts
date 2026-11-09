import { useEffect, useSyncExternalStore } from 'react';
import { notificationsStore } from '../store/notificationsStore';
import { useAuth } from './useAuth';
import { useRefreshOnForeground } from './useRefreshOnForeground';

const subscribe = (listener: () => void) =>
  notificationsStore.subscribe(listener);
const unread = () => notificationsStore.getState().unreadCount;

/** The Notifications tab badge's number (Notifications §5.5); 0 hides it. */
export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, unread);
}

/** The badge is fetched again on arrival at a screen when the feed is older than this. */
export const UNREAD_MAX_AGE_MS = 60_000;

/**
 * Keeps the badge's number fresh (Notifications §5.5): when the learner signs in or the app
 * starts, when the app comes back to the foreground, and on arrival at a screen (`focusKey`)
 * if the feed is over a minute old. Pull-to-refresh is the screen's own. Single-flight in the
 * store, so the screen asking too costs nothing.
 */
export function useKeepUnreadFresh(focusKey?: string): void {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    notificationsStore
      .hydrate()
      .then(() => notificationsStore.refreshIfStale(UNREAD_MAX_AGE_MS))
      .catch(() => undefined);
  }, [signedIn, focusKey]);

  useRefreshOnForeground(() => {
    if (signedIn) return notificationsStore.refresh().catch(() => undefined);
  });
}
