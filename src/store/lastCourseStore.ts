import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/**
 * The course the learner opened last — what Home's «Continue» picks up. A convenience, not
 * state anything depends on: lost or unreadable, Home falls back to the first course.
 *
 * Every course ever opened on this phone is kept beside it, for Today's group notice (block
 * 3): a course the learner has opened is not news. Lost, the notice only shows again.
 */
const storage = createAsyncStorage('voxord_last_course');
const KEY = 'courseId';
const OPENED_KEY = 'openedCourseIds';

export async function getLastCourseId(): Promise<string | null> {
  try {
    return (await storage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function getOpenedCourseIds(): Promise<Set<string>> {
  try {
    const raw = await storage.getItem(OPENED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    const opened = new Set<string>();
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') opened.add(id);
    const last = await storage.getItem(KEY);
    if (last) opened.add(last);
    return opened;
  } catch {
    return new Set();
  }
}

export async function setLastCourseId(courseId: string): Promise<void> {
  try {
    await storage.setItem(KEY, courseId);
    const opened = await getOpenedCourseIds();
    if (!opened.has(courseId)) {
      opened.add(courseId);
      await storage.setItem(OPENED_KEY, JSON.stringify([...opened]));
    }
  } catch {
    // A remembered course is worth nothing enough to report.
  }
}
