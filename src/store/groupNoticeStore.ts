import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/**
 * Today's group notices the learner hid (Home spec §6.2, block 3), one per school membership:
 * a new membership — another school, or a return after leaving — announces itself again.
 * Lost, a hidden notice only comes back.
 */
const storage = createAsyncStorage('voxord_today');
const key = (membershipId: string) => `home.groupNotice.dismissed:${membershipId}`;

export async function getDismissedNotices(membershipIds: readonly string[]): Promise<Set<string>> {
  const dismissed = new Set<string>();
  await Promise.all(
    membershipIds.map(async (id) => {
      try {
        if ((await storage.getItem(key(id))) === '1') dismissed.add(id);
      } catch {
        // Unreadable: shown again, which is the safe side.
      }
    }),
  );
  return dismissed;
}

export async function dismissNotice(membershipId: string): Promise<void> {
  try {
    await storage.setItem(key(membershipId), '1');
  } catch {
    // Hidden for this session; it may come back next time.
  }
}
