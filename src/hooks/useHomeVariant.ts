import { useCallback } from 'react';
import type { StudentSchool } from '../api/schools';
import { aiCaps, resolveVariant, type AiCaps, type HomeVariant } from '../screens/TodayScreen/variant';
import { useEntitlements } from './useEntitlements';
import { useSchools, type SchoolsState } from './useSchools';

export interface HomeVariantState {
  variant: HomeVariant;
  caps: AiCaps;
  schools: StudentSchool[] | null;
  schoolsStatus: SchoolsState['status'];
  /** Refetches the two sources the variant is drawn from. */
  refresh: () => Promise<void>;
}

/**
 * Which Today layout this learner gets (Home spec §5): `resolveVariant` over their schools and
 * entitlements. Until the schools are known the school layout stands, so a school learner is
 * not shown the solo blocks for a moment; entitlements arriving later only add the AI blocks.
 */
export function useHomeVariant(): HomeVariantState {
  const schools = useSchools();
  const entitlements = useEntitlements(schools.schools, schools.status);
  const settling = schools.status === 'loading' && schools.schools === null;
  const variant: HomeVariant = settling
    ? 'school'
    : resolveVariant({ schools: schools.schools, entitlements: entitlements.entitlements });
  const { refresh: refreshSchools } = schools;
  const { refresh: refreshEntitlements } = entitlements;
  const refresh = useCallback(
    () => Promise.all([refreshSchools(), refreshEntitlements()]).then(() => undefined),
    [refreshSchools, refreshEntitlements],
  );
  return {
    variant,
    caps: aiCaps(entitlements.entitlements),
    schools: schools.schools,
    schoolsStatus: schools.status,
    refresh,
  };
}
