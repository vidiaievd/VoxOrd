import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import type { UnitSummary } from '../../api/types';

interface UnitRowProps {
  unit: UnitSummary;
}

export function UnitRow({ unit }: UnitRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  const badge = {
    done: { label: t('courseHome.statusDone'), color: colors.success },
    active: { label: t('courseHome.statusActive'), color: colors.accent },
    locked: { label: t('courseHome.statusLocked'), color: colors.textMuted },
  }[unit.status];

  return (
    <View style={[styles.row, unit.status === 'locked' && styles.rowLocked]}>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {unit.title}
        </Text>
        <Text style={styles.progress}>
          {unit.completedLessons}/{unit.totalLessons}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: `${badge.color}22` }]}>
        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 10,
    },
    rowLocked: {
      opacity: 0.6,
    },
    info: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    progress: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
    },
    badge: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
  });
