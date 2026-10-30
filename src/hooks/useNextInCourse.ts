import { useMemo } from 'react';
import type { UnitContentsItem, UnitContentsResult, UnitSummary } from '../api/types';
import { useSwrResource } from './useSwrResource';
import { unitContentsResource } from '../lib/courseResources';
import { nextInUnit } from '../lib/nextItem';
import { nextUnit } from '../screens/TodayScreen/today';

export interface NextInCourse {
  /** The unit holding «Continue» — the same one Today's card names — or null once all are done. */
  unitId: string | null;
  /** The title of the material to continue with; null until the unit's contents are known. */
  title: string | null;
  /** The material itself and its unit's contents, for opening it straight away. */
  item: UnitContentsItem | null;
  contents: UnitContentsResult | null;
}

/**
 * Which unit carries the accent border and «next: …» on the course home (Courses spec §6.3).
 * Reads the same unit as Today's Resume (`nextUnit`), through the same cached contents.
 */
export function useNextInCourse(units: readonly UnitSummary[] | null): NextInCourse {
  const unit = useMemo(() => (units ? nextUnit(units) : null), [units]);
  const unitId = unit && unit.status === 'active' ? unit.id : null;
  const resource = useMemo(() => (unitId ? unitContentsResource(unitId) : null), [unitId]);
  const contents = useSwrResource<UnitContentsResult>(
    resource?.key ?? null,
    resource?.load ?? (() => Promise.reject(new Error('no unit'))),
  );
  const next = contents.data ? nextInUnit(contents.data) : null;
  return { unitId, title: next?.title ?? null, item: next, contents: contents.data };
}
