import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { Overline, PressableScale } from '../../components/ui';
import type { HistoryItem } from '../../api/courses';

interface Props {
  items: HistoryItem[];
  onOpen: (courseId: string) => void;
}

/**
 * Finished courses, read only (plan 90, live check, Q15): what is left of a purged school's
 * course (Q11) and any course the learner completed. A course that is gone for them is
 * named as unavailable, not dropped; several such courses share one row with their count
 * (nothing is left to tell them apart).
 */
export function HistorySection({ items, onOpen }: Props) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  if (items.length === 0) return null;

  const readable = items.filter(
    (item): item is HistoryItem & { container: NonNullable<HistoryItem['container']> } => item.container != null,
  );
  const goneCount = items.length - readable.length;
  const box = {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  };

  return (
    <View testID="history-section" style={{ gap: 14 }}>
      <View style={{ marginTop: 4 }}>
        <Overline>{t('coursesTab.history')}</Overline>
      </View>
      {readable.map(({ enrollment, container }) => {
        const date = enrollment.completedAt
          ? new Date(enrollment.completedAt).toLocaleDateString(language)
          : null;
        return (
          <PressableScale
            key={enrollment.id}
            onPress={() => onOpen(container.id)}
            accessibilityRole="button"
            accessibilityLabel={container.title}
            style={box}
          >
            <View style={{ gap: 3 }}>
              <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
                {container.title}
              </Text>
              <Text style={[typography.meta, { color: colors.neutral500 }]}>
                {[container.difficultyLevel, date ? t('coursesTab.historyFinished', { date }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </PressableScale>
        );
      })}
      {goneCount > 0 ? (
        <View testID="history-unavailable" style={box}>
          <View style={{ gap: 3 }}>
            <Text style={[typography.cardTitle, { color: colors.neutral400 }]} numberOfLines={2}>
              {goneCount === 1
                ? t('coursesTab.historyUnavailable')
                : t('coursesTab.historyUnavailableCount', { count: goneCount })}
            </Text>
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {goneCount === 1
                ? t('coursesTab.historyUnavailableNote')
                : t('coursesTab.historyUnavailableCountNote')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
