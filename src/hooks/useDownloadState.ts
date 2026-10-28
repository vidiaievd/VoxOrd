import { useCallback, useEffect, useState } from 'react';
import type { UnitSummary } from '../api/types';
import { courseDownloader } from '../services/courseDownload';
import { unitDownload, type UnitDownload } from '../services/unitDownloadState';
import { settingsStore } from '../store/settingsStore';

export interface DownloadStateHandle extends UnitDownload {
  /** Walks the downloader's window now; the unit is in it only when `inWindow`. */
  start: () => void;
}

/**
 * A unit's place in the offline download (Courses spec §11), over the existing course
 * downloader and the «units ahead» setting — no mechanism of its own. `units` is the course's
 * unit list; without it (the course home has not loaded) the state is `none`.
 */
export function useDownloadState(
  unitId: string,
  units: UnitSummary[] | null,
): DownloadStateHandle {
  const read = useCallback(
    () => unitDownload(unitId, units ?? [], settingsStore.getAll().offlineUnitsAhead, courseDownloader.getStatus()),
    [unitId, units],
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
    courseDownloader.run(true).catch(() => {
      // A failed walk shows as «none» again; nothing more to tell here.
    });
  }, []);

  return { ...value, start };
}
