import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { Icon, PressableScale } from '../../components/ui';
import type { UnitSummary } from '../../api/types';

interface UnitRowProps {
  unit: UnitSummary;
  /** 1-based number in the course, shown in the circle of an open unit. */
  number: number;
  /** The unit holding «Continue»: the only one with the accent border and «next: …». */
  isNext: boolean;
  /** Title of the material to continue with, when known. */
  nextTitle: string | null;
  onPress: () => void;
  /** A closed unit has no screen to open; the screen explains why instead. */
  onLockedPress: () => void;
}

/** One unit of the course (Courses spec §6.3): state is carried by the circle, not by a badge. */
export function UnitRow({ unit, number, isNext, nextTitle, onPress, onLockedPress }: UnitRowProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const locked = unit.status === 'locked';
  const done = unit.status === 'done';
  const started = unit.completedLessons > 0;
  const highlighted = unit.status === 'active' && isNext && started;

  const sub = locked
    ? t('courseHome.lockedReason')
    : unit.status === 'active' && !started
    ? t('courseHome.unitMaterials', { count: unit.totalLessons })
    : highlighted && nextTitle
    ? t('courseHome.unitProgressNext', {
        done: unit.completedLessons,
        total: unit.totalLessons,
        title: nextTitle,
      })
    : t('courseHome.unitProgress', { done: unit.completedLessons, total: unit.totalLessons });

  const circleBg = highlighted ? colors.accent800 : locked ? 'transparent' : colors.neutral800;
  const circleFg = highlighted ? colors.accent100 : colors.neutral300;

  return (
    <PressableScale
      onPress={locked ? onLockedPress : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unit.title}. ${sub}`}
      accessibilityState={{ disabled: locked }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        backgroundColor: locked ? 'transparent' : colors.surface,
        borderWidth: 1,
        borderColor: highlighted ? colors.accent700 : locked ? colors.neutral800 : 'transparent',
        opacity: locked ? 0.75 : 1,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: circleBg,
        }}
      >
        {done ? (
          <Icon name="Check" size={15} color={colors.neutral300} />
        ) : locked ? (
          <Icon name="LockSimple" size={15} color={colors.neutral500} />
        ) : (
          <Text style={[typography.secondary, { color: circleFg }]}>{number}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {unit.title}
        </Text>
        <Text
          style={[typography.meta, { color: highlighted ? colors.accent300 : colors.neutral500 }]}
          numberOfLines={2}
        >
          {sub}
        </Text>
      </View>
      {!locked && <Icon name="CaretRight" size={16} color={colors.neutral500} />}
    </PressableScale>
  );
}
