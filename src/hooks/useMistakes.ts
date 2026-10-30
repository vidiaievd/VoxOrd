import { useEffect, useMemo, useState } from 'react';
import { getCourseUnitIds } from '../api/courseHome';
import { getCourseMistakes } from '../api/mistakes';
import {
  mergeMistakes,
  settledEntries,
  type CourseMistakes,
  type MergedMistakes,
  type MistakeOverlayEntry,
} from '../lib/mistakes';
import { readCacheSnapshot, writeCacheSnapshot } from '../lib/swrCache';
import { PRACTICE_FEATURES } from '../screens/PracticeScreen/features';
import { exerciseOutboxStore } from '../store/exerciseOutboxStore';
import { mistakeOverlayStore } from '../store/mistakeOverlayStore';
import { useAuth } from './useAuth';
import { useMyCourses } from './useMyCourses';

/** A course's list as last heard from the server, and when it was asked for. */
interface CourseSnapshot extends CourseMistakes {
  askedAt: string;
}

const snapshotKey = (userId: string, courseId: string) => `practice-mistakes:${userId}:${courseId}`;

/**
 * «Exercises with mistakes» on the Practice root (Practice §6.3, plan 05 step 8), working
 * offline: each active course's list is kept on the device and read back when the server
 * cannot be reached, and the runner's own verdicts lie on top (`mistakeOverlayStore`). A
 * fresh answer from the server settles the verdicts it now has; the outbox sending its last
 * attempt for an exercise asks again, so a correction made offline reaches the list once the
 * phone is back online. `null` while nothing is known or with the switch off.
 */
export function useMistakes(nonce: number): MergedMistakes | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { courses } = useMyCourses();
  const courseKey = courses.map(c => c.container.id).join(',');
  const [lists, setLists] = useState<CourseMistakes[] | null>(null);
  const [overlay, setOverlay] = useState<MistakeOverlayEntry[]>([]);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const read = () => setOverlay(mistakeOverlayStore.list(userId));
    const off = mistakeOverlayStore.subscribe(read);
    void mistakeOverlayStore.load().then(read);
    return off;
  }, [userId]);

  useEffect(() => {
    let pending = exerciseOutboxStore.pendingCount;
    return exerciseOutboxStore.subscribe(() => {
      const now = exerciseOutboxStore.pendingCount;
      if (now < pending) setSent(n => n + 1);
      pending = now;
    });
  }, []);

  useEffect(() => {
    if (!PRACTICE_FEATURES.mistakes || !userId || courses.length === 0) {
      setLists(null);
      return;
    }
    let live = true;
    Promise.all(
      courses.map(async ({ container }): Promise<CourseMistakes | null> => {
        const key = snapshotKey(userId, container.id);
        const askedAt = new Date().toISOString();
        try {
          const [page, unitIds] = await Promise.all([
            getCourseMistakes(container.id),
            getCourseUnitIds(container),
          ]);
          const snapshot: CourseSnapshot = { courseId: container.id, ...page, unitIds, askedAt };
          void writeCacheSnapshot(key, snapshot);
          const settled = settledEntries(
            mistakeOverlayStore.list(userId).filter(e => e.courseId === container.id),
            askedAt,
            exerciseOutboxStore.pendingExerciseIds(),
          );
          void mistakeOverlayStore.settle(settled);
          return snapshot;
        } catch {
          return readCacheSnapshot<CourseSnapshot>(key);
        }
      }),
    ).then(results => {
      if (!live) return;
      const known = results.filter((r): r is CourseMistakes => r !== null);
      setLists(known.length === 0 ? null : known);
    });
    return () => {
      live = false;
    };
    // `courseKey` stands for `courses`: the cached list is a new array on every revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseKey, userId, nonce, sent]);

  return useMemo(() => (lists === null ? null : mergeMistakes(lists, overlay)), [lists, overlay]);
}
