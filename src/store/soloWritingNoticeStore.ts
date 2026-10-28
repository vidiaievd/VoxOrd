import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/** Block 10's «Writing and speaking» notice, hidden for good once the learner closes it. */
const storage = createAsyncStorage('voxord_today');
const KEY = 'home.soloWritingNotice.dismissed';

export async function isSoloWritingDismissed(): Promise<boolean> {
  try {
    return (await storage.getItem(KEY)) === '1';
  } catch {
    // Unreadable: shown again, which is the safe side.
    return false;
  }
}

export async function dismissSoloWriting(): Promise<void> {
  try {
    await storage.setItem(KEY, '1');
  } catch {
    // Hidden for this session; it may come back next time.
  }
}
