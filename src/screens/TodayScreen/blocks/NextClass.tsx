import React from 'react';
import { Text, View } from 'react-native';
import { classStart, type NextClass as NextClassData } from '../../../api/nextClass';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { classRelative } from '../blockLogic';
import { WEEKDAY_KEYS } from '../dayLine';

interface NextClassProps {
  nextClass: NextClassData | null;
}

/**
 * Block 7: the soonest class within two weeks. No empty card — on the phone an empty slot
 * spends the first screen. Not pressable: there is no school screen on the phone.
 */
export function NextClass({ nextClass }: NextClassProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  if (!nextClass) return null;

  const start = classStart(nextClass);
  const relative = classRelative(start, new Date(), t);
  const time = `${nextClass.startTime}–${nextClass.endTime}`;
  const line = [time, nextClass.groupName].filter(Boolean).join(' · ');
  const where = [
    nextClass.schoolName,
    nextClass.room ? t('today.nextClass.room', { room: nextClass.room }) : null,
    nextClass.teacher?.name ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      accessible
      accessibilityLabel={[`${t('today.nextClass.title')} ${relative}`, line, where].join('. ')}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        padding: spacing.cardPadding,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <View
        style={{
          width: 48,
          height: 56,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.neutral700,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.overline, { color: colors.neutral400, fontSize: 10 }]}>
          {t(`today.weekdayShort.${WEEKDAY_KEYS[start.getDay()]}`)}
        </Text>
        <Text style={[typography.cardTitle, { color: colors.text, fontSize: 20, lineHeight: 24 }]}>
          {start.getDate()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.overline, { color: colors.neutral400 }]} numberOfLines={1}>
          {`${t('today.nextClass.title')} · ${relative}`}
        </Text>
        <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={1}>
          {line}
        </Text>
        {where ? (
          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={2}>
            {where}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
