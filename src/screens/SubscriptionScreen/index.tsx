import React, { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyAiUsage, type AiUsage } from '../../api/assistant';
import { getEntitlements, type Entitlements } from '../../api/entitlements';
import {
  getOwnSubscription,
  type OwnSubscription,
} from '../../api/ownSubscription';
import { SettingsGroup, SettingsRow, SubScreen, SubScreenHero } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useSchools } from '../../hooks/useSchools';
import { useSwrResource } from '../../hooks/useSwrResource';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { creditsMeter } from '../TodayScreen/blockLogic';
import { subscriptionCard } from '../ProfileScreen/profileLogic';
import { includedRows, schoolCourseRows } from './subscriptionLogic';

const CREDITS_FEATURE = 'ai.review_direct';

/**
 * Subscription (Profile §7.2, adjusted by G1): the learner's own plan, what it switches on and
 * the courses their schools open. No store buttons, no restore, no «Get Pro» — there is no
 * billing yet; `platform_admin` assigns plans.
 */
export function SubscriptionScreen({
  onBack,
  onOpenCourse,
}: {
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;

  const subLoader = useCallback(() => getOwnSubscription(), []);
  const sub = useSwrResource<OwnSubscription | null>(
    userId ? `own-subscription:${userId}` : null,
    subLoader,
  );
  const entLoader = useCallback(() => getEntitlements(), []);
  const ent = useSwrResource<Entitlements | null>(
    userId ? `own-entitlements:${userId}` : null,
    entLoader,
  );
  const hasCredits = ent.data?.features[CREDITS_FEATURE]?.enabled === true;
  const usageLoader = useCallback(() => getMyAiUsage(CREDITS_FEATURE), []);
  const usage = useSwrResource<AiUsage | null>(
    userId && hasCredits ? `ai-usage:${userId}:${CREDITS_FEATURE}` : null,
    usageLoader,
  );
  const { schools } = useSchools();

  const formatDate = useCallback(
    (iso: string) => {
      try {
        return new Date(iso).toLocaleDateString(language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return iso.slice(0, 10);
      }
    },
    [language],
  );

  const card = sub.data ? subscriptionCard(sub.data, t, formatDate) : null;
  const included = includedRows(
    ent.data ?? null,
    creditsMeter(hasCredits ? usage.data ?? null : null),
    t,
  );
  const courses = schoolCourseRows(schools);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('nav.profile')}
        onBack={onBack}
        title={t('subscription.title')}
        hero={
          <SubScreenHero
            overline={t('subscription.kicker')}
            title={card?.title ?? t('subscription.free')}
            meta={card?.meta ?? undefined}
          />
        }
      >
        {included.length > 0 ? (
          <SettingsGroup title={t('subscription.included')}>
            {included.map((r, i) =>
              r.value ? (
                <SettingsRow
                  key={r.key}
                  isFirst={i === 0}
                  type="value"
                  icon={r.icon}
                  label={r.label}
                  value={r.value}
                />
              ) : (
                <SettingsRow
                  key={r.key}
                  isFirst={i === 0}
                  type="check"
                  icon={r.icon}
                  label={r.label}
                />
              ),
            )}
          </SettingsGroup>
        ) : null}
        {courses.length > 0 ? (
          <SettingsGroup
            title={t('subscription.schoolAccess')}
            note={t('subscription.schoolNote')}
          >
            {courses.map((c, i) => (
              <SettingsRow
                key={c.courseId}
                isFirst={i === 0}
                type="navigate"
                icon="GraduationCap"
                label={c.title}
                sub={t('subscription.paidBy', { school: c.schoolName })}
                onPress={() => onOpenCourse(c.courseId)}
              />
            ))}
          </SettingsGroup>
        ) : null}
      </SubScreen>
    </SafeAreaView>
  );
}
