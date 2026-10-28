import React from 'react';
import { Text, View } from 'react-native';
import { Icon, PressableScale } from '../../components/ui';
import { useSettings } from '../../hooks/useSettings';
import { useTranslation } from '../../i18n';
import type { MistakeRowData } from '../../lib/mistakes';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { contentIcon } from '../UnitContentsScreen/contentIcon';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar days between the two moments. */
function calendarDaysBetween(at: Date, now: Date): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day(now) - day(at)) / DAY_MS);
}

/**
 * An exercise with an uncorrected mistake (Practice §6.3, card row): the template's icon, the
 * exercise and «Unit N · mistake today / yesterday / 12 Oct».
 */
export function MistakeRow({ row, onPress }: { row: MistakeRowData; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { uiLanguage } = useSettings();

  const at = new Date(row.attemptedAt);
  const days = calendarDaysBetween(at, new Date());
  let when = row.attemptedAt.slice(0, 10);
  if (days <= 0) when = t('practice.whenToday');
  else if (days === 1) when = t('practice.whenYesterday');
  else {
    try {
      when = at.toLocaleDateString(uiLanguage, { day: 'numeric', month: 'short' });
    } catch {
      // The ISO day is still true.
    }
  }
  const title = row.title ?? t('practice.mistakeUntitled');
  const sub = t('practice.mistakeRowSub', { unit: row.unitNumber, when });

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        paddingVertical: 13,
        paddingHorizontal: 16,
      }}
    >
      <Icon
        name={contentIcon({ contentType: 'exercise', lessonKind: null }, row.templateCode)}
        size={20}
        color={colors.neutral300}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}
