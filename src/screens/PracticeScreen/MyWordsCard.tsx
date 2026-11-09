import React from 'react';
import { Text, View } from 'react-native';
import { Icon, PressableScale } from '../../components/ui';
import type { MyWordsSummary } from '../../hooks/usePracticeHome';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

/** The «My words» entry (Practice §6.3, card row): the total and how many await a translation. */
export function MyWordsCard({
  summary,
  onPress,
}: {
  summary: MyWordsSummary | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const sub =
    summary === null
      ? null
      : [
          t('practice.myWordsRow', { count: summary.total }),
          summary.pending > 0 ? t('practice.myWordsPending', { count: summary.pending }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={sub ? `${t('practice.myWordsTitle')}. ${sub}` : t('practice.myWordsTitle')}
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
      <Icon name="BookmarkSimple" size={20} color={colors.neutral300} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text }]}>{t('practice.myWordsTitle')}</Text>
        {sub ? (
          <Text style={[typography.meta, { color: colors.neutral500 }]}>{sub}</Text>
        ) : null}
      </View>
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}
