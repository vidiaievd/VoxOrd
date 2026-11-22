import { useCallback, useEffect, useRef, useState } from 'react';
import type { UnitSummary } from '../api/types';
import { courseDownloader } from '../services/courseDownload';
import { unitDownload, type UnitDownload } from '../services/unitDownloadState';
import { settingsStore } from '../store/settingsStore';

export interface DownloadStateHandle extends UnitDownload {
  /** Walks this course's window now; the unit is in it only when `inWindow`. */
  start: () => void;
}

/**
 * A unit's place in the offline download (Courses spec §11), over the existing course
 * downloader and the «units ahead» setting. `units` is the course's unit list; without it
 * (the course home has not loaded) the state is `none`.
 */
export function useDownloadState(
  unitId: string,
  courseId: string,
  units: UnitSummary[] | null,
): DownloadStateHandle {
  const read = useCallback(
    () =>
      unitDownload(
        unitId,
        units ?? [],
        settingsStore.getAll().offlineUnitsAhead,
        courseDownloader.getStatus(),
        courseDownloader.getUnitProgress(unitId),
        courseDownloader.isPinned(courseId),
        courseDownloader.courseWalked(courseId),
      ),
    [unitId, courseId, units],
  );
  const [value, setValue] = useState<UnitDownload>(read);

  useEffect(() => {
    setValue(read());
    courseDownloader.loadStatus().catch(() => {});
    const update = () => setValue(read());
    const offDownloader = courseDownloader.subscribe(update);
    const offSettings = settingsStore.subscribe(update);
    return () => {
      offDownloader();
      offSettings();
    };
  }, [read]);

  const start = useCallback(() => {
    courseDownloader.run(true, courseId).catch(() => {
      // A failed walk shows as «none» again; nothing more to tell here.
    });
  }, [courseId]);

  // A course no walk has reached (enrolled on the web or by the school while the app stayed
  // open) is walked once when its unit opens, as a course enrolled on the phone is. Offline the
  // walk ends at once and the unit reads «none»; the next online session walks it anyway.
  const autoStarted = useRef<string | null>(null);
  useEffect(() => {
    if (!value.inWindow || autoStarted.current === courseId) return;
    if (courseDownloader.courseWalked(courseId) !== false) return;
    autoStarted.current = courseId;
    courseDownloader.run(false, courseId).catch(() => {});
  }, [value.inWindow, courseId]);

  return { ...value, start };
}
