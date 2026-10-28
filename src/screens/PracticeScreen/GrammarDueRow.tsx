import React from 'react';
import { Text, View } from 'react-native';
import { Icon, PressableScale, ProgressTrack } from '../../components/ui';
import { useGrammarRuleReader } from '../../hooks/useGrammarRuleReader';
import { useTranslation } from '../../i18n';
import type { GrammarDueRowData } from '../../lib/grammarDue';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

/**
 * A rule due for review (Practice §6.3, card row): its title, unit, days without practice and
 * mastery. The title is the rule's explanation, read through the reader's own cache — the due
 * list names rules by id only.
 */
export function GrammarDueRow({ row, onPress }: { row: GrammarDueRowData; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const reader = useGrammarRuleReader(row.ruleId, row.courseId);
  const title = reader.data?.displayTitle ?? null;
  const sub =
    row.idleDays === null
      ? t('practice.grammarRowNever', { unit: row.unitNumber })
      : t('practice.grammarRowSub', { unit: row.unitNumber, count: row.idleDays });
  const percent = `${row.masteryPercent}%`;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[title, sub, `${t('grammarReview.mastery')} ${percent}`].filter(Boolean).join('. ')}
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        paddingVertical: 13,
        paddingHorizontal: 16,
        gap: 9,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="TreeStructure" size={20} color={colors.neutral300} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.body, { color: title ? colors.text : colors.neutral500 }]} numberOfLines={1}>
            {title ?? '…'}
          </Text>
          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Icon name="CaretRight" size={16} color={colors.neutral600} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 32 }}>
        <View style={{ flex: 1 }}>
          <ProgressTrack value={row.masteryPercent / 100} fill={colors.accent600} />
        </View>
        <Text style={[typography.meta, { color: colors.neutral400 }]}>{percent}</Text>
      </View>
    </PressableScale>
  );
}
