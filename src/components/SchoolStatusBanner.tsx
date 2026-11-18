import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../i18n';
import { useTheme } from '../providers/ThemeProvider';
import { daysLeft, type MaintenanceStatus, type SchoolLifecycleStatus } from '../lib/schoolLifecycle';

interface Props {
  status: SchoolLifecycleStatus | undefined;
  /** When a suspended school closes by itself (ISO). */
  closesAt?: string | null;
}

/**
 * Says why a school's course is read only (plan 90, phase 5). Draws nothing for an `active`
 * school or one whose status the service did not send — an older service must not make every
 * school look blocked.
 */
export function SchoolStatusBanner({ status, closesAt }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  if (!status || status === 'active') return null;

  const closed = status === 'closed' || status === 'purged';
  const days = closed ? null : daysLeft(closesAt);
  const body = closed
    ? t('schoolLifecycle.closed')
    : days !== null
      ? t('schoolLifecycle.suspendedDays', { days })
      : t('schoolLifecycle.suspended');

  return (
    <View
      accessibilityRole="alert"
      testID="school-status-banner"
      style={[styles.box, { backgroundColor: closed ? colors.danger : colors.warning }]}
    >
      <Text style={[typography.cardTitleMedium, { color: colors.textInverted }]}>
        {t(closed ? 'schoolLifecycle.closedTitle' : 'schoolLifecycle.suspendedTitle')}
      </Text>
      <Text style={[typography.secondary, { color: colors.textInverted }]}>{body}</Text>
    </View>
  );
}

/** A course the author no longer looks after, or that takes no new learners (plan 90, Q5). */
export function MaintenanceNote({ status }: { status: MaintenanceStatus | undefined }) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  if (status !== 'unmaintained' && status !== 'obsolete') return null;

  return (
    <View testID="maintenance-note" style={[styles.note, { borderColor: colors.neutral700 }]}>
      <Text style={[typography.meta, { color: colors.neutral300 }]}>
        {t(status === 'obsolete' ? 'schoolLifecycle.obsolete' : 'schoolLifecycle.unmaintained')}
      </Text>
      <Text style={[typography.secondary, { color: colors.neutral400 }]}>
        {t(status === 'obsolete' ? 'schoolLifecycle.obsoleteNote' : 'schoolLifecycle.unmaintainedNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, padding: 12, gap: 4 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
});
