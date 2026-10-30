import type { OwnSubscription } from '../../api/ownSubscription';
import { isPlaced, type StudentSchool } from '../../api/schools';

type T = (path: string, vars?: Record<string, string | number>) => string;

/** The avatar's letter: the name's first, else the e-mail's, else nothing. */
export function avatarLetter(
  name: string | null,
  email: string | null,
): string {
  const source = (name ?? email ?? '').trim();
  return source ? Array.from(source)[0].toUpperCase() : '';
}

/** Profile §5.2 block 2: no name → the e-mail leads and the line under it has no e-mail. */
export function identityLines(
  name: string | null,
  email: string | null,
  t: T,
): { title: string; meta: string } {
  if (name)
    return {
      title: name,
      meta: email
        ? `${email} · ${t('profile.viaEmail')}`
        : t('profile.viaEmail'),
    };
  return { title: email ?? '', meta: t('profile.viaEmail') };
}

export interface SubscriptionCard {
  /** Lit gradient only for a plan the learner holds; the free plan is a plain card. */
  lit: boolean;
  title: string;
  meta: string | null;
  tag: string | null;
}

/** Block 3, by what is real (no billing, decision D2): no renewal, no «Pro» unless it is the plan's name. */
export function subscriptionCard(
  sub: OwnSubscription,
  t: T,
  formatDate: (iso: string) => string,
): SubscriptionCard {
  if (sub.source === 'free_plan' || !sub.planName) {
    return { lit: false, title: t('profile.sub.free'), meta: null, tag: null };
  }
  return {
    lit: true,
    title: sub.planName,
    meta: sub.endsAt
      ? t('profile.sub.until', { date: formatDate(sub.endsAt) })
      : null,
    tag: sub.status === 'trial' ? t('profile.sub.trial') : null,
  };
}

export interface SchoolRow {
  schoolId: string;
  name: string;
  meta: string;
}

/** Block 4: one row per school the learner studies in; «Group X · Teacher» when placed. */
export function schoolRows(
  schools: readonly StudentSchool[] | null,
  t: T,
): SchoolRow[] {
  return (schools ?? []).filter(isPlaced).map(s => {
    const group = s.groups[0];
    const teacher = group?.teachers[0]?.name;
    const label = s.groupName ?? '';
    const meta = teacher
      ? t('profile.schoolMeta', { group: label, teacher })
      : label
      ? t('profile.schoolGroup', { group: label })
      : t('profile.schoolNoGroup');
    return { schoolId: s.schoolId, name: s.schoolName, meta };
  });
}
