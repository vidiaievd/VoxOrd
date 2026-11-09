import type { Entitlements } from '../../api/entitlements';
import { isPlaced, type StudentSchool } from '../../api/schools';
import type { IconName } from '../../components/ui';
import type { CreditsMeter } from '../TodayScreen/blockLogic';

type T = (path: string, vars?: Record<string, string | number>) => string;

export interface IncludedRow {
  key: string;
  icon: IconName;
  label: string;
  /** «3 of 20» for the metered feature; absent = a plain check. */
  value?: string;
}

/** Feature keys shown to the learner, in order, with their icon and label key. */
const FEATURES: readonly { key: string; icon: IconName; label: string }[] = [
  { key: 'ai.review_direct', icon: 'Sparkle', label: 'subscription.aiReview' },
  { key: 'ai.student_assist', icon: 'ChatCenteredText', label: 'subscription.assistant' },
  { key: 'ai.practice', icon: 'Brain', label: 'subscription.practice' },
];

/** What the learner's OWN plan switches on; the credits line only for a metered feature. */
export function includedRows(
  ent: Entitlements | null,
  meter: CreditsMeter | null,
  t: T,
): IncludedRow[] {
  if (!ent) return [];
  return FEATURES.filter(f => ent.features[f.key]?.enabled === true).map(f => ({
    key: f.key,
    icon: f.icon,
    label: t(f.label),
    value:
      f.key === 'ai.review_direct' && meter
        ? t('subscription.ofTotal', { used: meter.used, total: meter.total })
        : undefined,
  }));
}

export interface SchoolCourseRow {
  courseId: string;
  title: string;
  schoolName: string;
}

/** Courses the learner's schools open to them, once each; a course without a known title is left out. */
export function schoolCourseRows(
  schools: readonly StudentSchool[] | null,
): SchoolCourseRow[] {
  const seen = new Set<string>();
  const rows: SchoolCourseRow[] = [];
  for (const s of (schools ?? []).filter(isPlaced)) {
    for (const g of s.groups) {
      for (const m of [g.mainCourse, ...g.materials]) {
        if (!m || !m.courseName || seen.has(m.courseId)) continue;
        seen.add(m.courseId);
        rows.push({
          courseId: m.courseId,
          title: m.courseName,
          schoolName: s.schoolName,
        });
      }
    }
  }
  return rows;
}
