import { useSyncExternalStore } from 'react';
import { notificationsStore } from '../store/notificationsStore';

const subscribe = (listener: () => void) =>
  notificationsStore.subscribe(listener);
const unread = () => notificationsStore.getState().unreadCount;

/** The Notifications tab badge's number (Notifications §5.5); 0 hides it. */
export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, unread);
}
