import type { NotificationItem } from '../api/notifications';
import type { Screen } from './screens';

/**
 * Where a tapped notification leads (Notifications spec §5.4), or `null` for no move. One
 * function for the row and, later, for a push that carries a `notificationId` (spec §6).
 * Back from `Submission` falls to the Notifications tab by `backTarget`'s default.
 */
export function notificationScreen(
  item: Pick<NotificationItem, 'target'>,
): Screen | null {
  const { target } = item;
  switch (target.kind) {
    case 'submission':
      return {
        name: 'Submission',
        submissionId: target.submissionId,
        exerciseId: target.exerciseId,
      };
    default:
      return null;
  }
}

/** Navigates to an item's target; an item with none stays where it is. Returns whether it moved. */
export function openNotification(
  item: Pick<NotificationItem, 'target'>,
  navigate: (screen: Screen) => void,
): boolean {
  const screen = notificationScreen(item);
  if (!screen) return false;
  navigate(screen);
  return true;
}
