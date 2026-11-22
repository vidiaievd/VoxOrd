import type { UnitSummary } from '../api/types';
import {
  unitWindow,
  type CourseDownloadStatus,
  type ItemDownloadState,
  type UnitProgress,
} from './courseDownload';

export type UnitDownloadState = 'none' | 'downloading' | 'done';

export interface UnitDownload {
  state: UnitDownloadState;
  /** The unit lies in what the downloader keeps; outside it a tap cannot download it. */
  inWindow: boolean;
  /** Share of the unit's materials fetched, 0..1; null before the unit's contents are known. */
  progress: number | null;
  /** Bytes of the unit's media on the phone; null when not known (e.g. after a restart). */
  sizeBytes: number | null;
  /** Download state of each material by its id, while the downloader has an account of them. */
  items: Record<string, ItemDownloadState>;
  /**
   * The downloader's account of the unit misses materials the unit has now (added after the
   * walk): the unit is not on the phone whole, and a walk would fetch the rest.
   */
  outdated: boolean;
}

/**
 * What the unit screen shows as the unit's download state (Courses spec §11), read from the
 * existing course downloader. The downloader keeps a window of units (the current one and
 * `offlineUnitsAhead` after it; the whole course when the learner keeps it whole) and accounts
 * for each material of the units it walks. With that account the state is exact: «downloading»
 * until the walk closes the unit, then «done» if every material is on the phone. Without it
 * (the app restarted since) a unit in the window counts as «done» once a walk ended without
 * a failure — progress and size are then unknown — unless no walk has reached its course yet
 * (`courseWalked` false: enrolled on the web or by the school since): that unit is «none».
 * `itemIds` — the unit's materials as its screen lists them now (containers left out, as the
 * walk leaves them out); a material the closed account does not name makes the unit «none»
 * and `outdated` — a teacher added it after the walk. After a restart the account is gone;
 * `walkedItems` (what the unit held at its last walk, kept on the phone) answers the same.
 */
export function unitDownload(
  unitId: string,
  units: UnitSummary[],
  unitsAhead: number,
  status: Pick<CourseDownloadStatus, 'running' | 'lastFinishedAt' | 'lastFailed'>,
  progress?: UnitProgress,
  pinned = false,
  courseWalked: boolean | null = null,
  itemIds: readonly string[] | null = null,
  walkedItems?: readonly string[],
): UnitDownload {
  const inWindow = pinned || unitWindow(units, unitsAhead).some(u => u.id === unitId) || progress !== undefined;

  if (progress) {
    const states = Object.values(progress.items);
    const done = states.filter(s => s === 'done').length;
    const fraction = states.length === 0 ? null : done / states.length;
    if (!progress.complete) {
      return {
        state: 'downloading',
        inWindow,
        progress: fraction,
        sizeBytes: progress.sizeBytes,
        items: progress.items,
        outdated: false,
      };
    }
    const missing = itemIds ? itemIds.filter(id => !(id in progress.items)).length : 0;
    if (missing > 0) {
      return {
        state: 'none',
        inWindow,
        progress: done / (states.length + missing),
        sizeBytes: progress.sizeBytes,
        items: progress.items,
        outdated: true,
      };
    }
    const allIn = states.length > 0 && done === states.length;
    return {
      state: allIn ? 'done' : 'none',
      inWindow,
      progress: fraction,
      sizeBytes: progress.sizeBytes,
      items: progress.items,
      outdated: false,
    };
  }

  const none = { progress: null, sizeBytes: null, items: {}, outdated: false };
  if (!inWindow) return { state: 'none', inWindow, ...none };
  if (status.running) return { state: 'downloading', inWindow, ...none };
  if (itemIds && walkedItems && itemIds.some(id => !walkedItems.includes(id))) {
    return { state: 'none', inWindow, ...none, outdated: true };
  }
  const done = courseWalked !== false && status.lastFinishedAt !== null && status.lastFailed === 0;
  return { state: done ? 'done' : 'none', inWindow, ...none };
}

