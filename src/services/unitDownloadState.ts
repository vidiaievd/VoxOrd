import type { UnitSummary } from '../api/types';
import { unitWindow, type CourseDownloadStatus } from './courseDownload';

export type UnitDownloadState = 'none' | 'downloading' | 'done';

export interface UnitDownload {
  state: UnitDownloadState;
  /** The unit lies in the window the downloader keeps; outside it a tap cannot download it. */
  inWindow: boolean;
}

/**
 * What the unit screen shows as the unit's download state (Courses spec §11), read from the
 * existing course downloader: the downloader keeps a window of units (the current one and
 * `offlineUnitsAhead` after it), so a unit is «on the phone» when it is in that window and the
 * last walk ended without a failure, «downloading» while a walk runs, otherwise «none». There is
 * no per-unit progress or size — the walk is per course and counts neither.
 */
export function unitDownload(
  unitId: string,
  units: UnitSummary[],
  unitsAhead: number,
  status: Pick<CourseDownloadStatus, 'running' | 'lastFinishedAt' | 'lastFailed'>,
): UnitDownload {
  const inWindow = unitWindow(units, unitsAhead).some(u => u.id === unitId);
  if (!inWindow) return { state: 'none', inWindow };
  if (status.running) return { state: 'downloading', inWindow };
  const done = status.lastFinishedAt !== null && status.lastFailed === 0;
  return { state: done ? 'done' : 'none', inWindow };
}
