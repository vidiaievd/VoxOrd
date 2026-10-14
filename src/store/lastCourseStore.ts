import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/**
 * The course the learner opened last — what Home's «Continue» picks up. A convenience, not
 * state anything depends on: lost or unreadable, Home falls back to the first course.
 */
const storage = createAsyncStorage('voxord_last_course');
const KEY = 'courseId';

export async function getLastCourseId(): Promise<string | null> {
  try {
    return (await storage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function setLastCourseId(courseId: string): Promise<void> {
  try {
    await storage.setItem(KEY, courseId);
  } catch {
    // A remembered course is worth nothing enough to report.
  }
}
