import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Spinner } from '../../components/ui';
import { SchoolStatusBanner } from '../../components/SchoolStatusBanner';
import { useCourseHome } from '../../hooks/useCourseHome';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { onSchoolNotActive, type SchoolLifecycleStatus } from '../../lib/schoolLifecycle';

export interface SchoolGateState {
  /** No answer yet and nothing cached: the course home is still loading. */
  checking: boolean;
  /** Set when the course's school is not `active`; the engine would refuse every start. */
  status: SchoolLifecycleStatus | null;
  closesAt: string | null;
}

/**
 * Whether the school that owns this course lets its exercises be started (plan 90, live check,
 * Q15). Read from the course home the learner has just come from, so it is usually cached.
 * Fails open: offline with nothing cached, or a read that failed, lets the runner open — the
 * engine and the offline queue still decide, this only saves the learner a wasted answer.
 */
export function useSchoolGate(courseId: string): SchoolGateState {
  const home = useCourseHome(courseId);
  const info = home.data?.courseInfo;
  const status = info?.schoolStatus;
  return {
    checking: home.status === 'loading' && home.data === null,
    status: status && status !== 'active' ? status : null,
    closesAt: info?.schoolClosesAt ?? null,
  };
}

/**
 * A start or hand-in the learner's school refused as read only (plan 90, phase 5): `notify` words
 * it once, the returned status keeps the banner under the runner's header so the reason is still
 * there when the body's own «try again» appears (Q15). A hand-in that went through afterwards
 * (`handedIn` turns truthy — the school was reactivated) takes the banner away: it would only
 * say the work cannot be handed in right under a verdict that says it was.
 */
export function useSchoolRefusal(
  handedIn: unknown,
  notify: (key: 'schoolSuspended' | 'schoolClosed') => void,
): 'suspended' | 'closed' | null {
  const [refusal, setRefusal] = useState<'suspended' | 'closed' | null>(null);
  useEffect(
    () =>
      onSchoolNotActive(key => {
        notify(key);
        setRefusal(key === 'schoolClosed' ? 'closed' : 'suspended');
      }),
    [notify],
  );
  useEffect(() => {
    if (handedIn) setRefusal(null);
  }, [handedIn]);
  return refusal;
}

/** Stands in for the runner while the course's school is read only: says why, before any work. */
export function SchoolPausedScreen({
  status,
  closesAt,
  onBack,
}: {
  status: SchoolLifecycleStatus;
  closesAt: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View testID="school-paused-screen" style={styles.body}>
        <SchoolStatusBanner status={status} closesAt={closesAt} />
        <Text style={[typography.secondary, { color: colors.neutral300 }]}>
          {t('schoolLifecycle.blockedStart')}
        </Text>
        <Button size={44} label={t('schoolLifecycle.blockedBack')} onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

export function SchoolGateChecking() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.body}>
        <Spinner size={24} color={colors.neutral400} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
});
