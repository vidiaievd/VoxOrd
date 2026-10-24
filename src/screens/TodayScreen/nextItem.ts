import type {
  UnitContentsItem,
  UnitContentsItemType,
  UnitContentsResult,
  UnitSummary,
} from '../../api/types';
import { itemsInOrder, nextItem } from '../../lib/nextItem';
import { nextUnit } from './today';

/** `itemType.*` in i18n. */
export type ItemTypeLabel = Exclude<UnitContentsItemType, 'container'>;

/** On the phone: downloaded, opens anywhere. Needs network: offline and not downloaded. */
export type ItemAvailability = 'onPhone' | 'needsNetwork' | null;

export interface ItemMeta {
  type: ItemTypeLabel;
  minutes: number | null;
  availability: ItemAvailability;
}

export interface ResumeItem {
  item: UnitContentsItem;
  meta: ItemMeta;
}

/**
 * What block 4 shows (Home spec §6.2):
 * - `item`: the exact material to open, with up to two that follow it in the unit;
 * - `unit`: the unit only — its contents are not reachable, or nothing in it is open now;
 * - `courseDone`: every unit is done, the card offers the course itself.
 */
export type Resume =
  | {
      kind: 'item';
      unit: UnitSummary;
      next: ResumeItem;
      upcoming: ResumeItem[];
      done: number;
      total: number;
    }
  | { kind: 'unit'; unit: UnitSummary }
  | { kind: 'courseDone'; unit: UnitSummary };

export interface ResumeInputs {
  units: readonly UnitSummary[];
  unitContents: Readonly<Record<string, UnitContentsResult | undefined>>;
  /** Units whose materials are on the phone. */
  downloadedUnitIds: ReadonlySet<string>;
  offline: boolean;
}

/** «Upcoming» rows under the button: at most this many. */
const UPCOMING_LIMIT = 2;

export function itemMeta(
  item: UnitContentsItem,
  downloaded: boolean,
  offline: boolean,
): ItemMeta {
  return {
    type: item.contentType === 'container' ? 'lesson' : item.contentType,
    minutes: item.durationMinutes,
    availability: downloaded ? 'onPhone' : offline ? 'needsNetwork' : null,
  };
}

export function resolveResume(input: ResumeInputs): Resume | null {
  const { units, unitContents, downloadedUnitIds, offline } = input;
  const unit = nextUnit(units);
  if (!unit) return null;
  if (unit.status === 'done') return { kind: 'courseDone', unit };

  const found = nextItem({ units: [...units] }, unitContents);
  const contents = found ? unitContents[found.unitId] : undefined;
  const owner = found ? units.find((u) => u.id === found.unitId) : undefined;
  if (!found || !contents || !owner) return { kind: 'unit', unit };

  const downloaded = downloadedUnitIds.has(owner.id);
  const items = itemsInOrder(contents).filter((i) => i.contentType !== 'container');
  const at = items.findIndex((i) => i.id === found.item.id);
  const upcoming = items
    .slice(at + 1)
    .filter((i) => i.status !== 'completed' && i.status !== 'submitted')
    .slice(0, UPCOMING_LIMIT)
    .map((item) => ({ item, meta: itemMeta(item, downloaded, offline) }));

  return {
    kind: 'item',
    unit: owner,
    next: { item: found.item, meta: itemMeta(found.item, downloaded, offline) },
    upcoming,
    done: items.filter((i) => i.status === 'completed').length,
    total: items.length,
  };
}
