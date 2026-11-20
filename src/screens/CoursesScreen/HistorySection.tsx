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
 * named as unavailable, not dropped.
 */
export function HistorySection({ items, onOpen }: Props) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  if (items.length === 0) return null;

  return (
    <View testID="history-section" style={{ gap: 14 }}>
      <View style={{ marginTop: 4 }}>
        <Overline>{t('coursesTab.history')}</Overline>
      </View>
      {items.map(({ enrollment, container }) => {
        const date = enrollment.completedAt
          ? new Date(enrollment.completedAt).toLocaleDateString(language)
          : null;
        const body = (
          <View style={{ gap: 3 }}>
            <Text style={[typography.cardTitle, { color: container ? colors.text : colors.neutral400 }]} numberOfLines={2}>
              {container ? container.title : t('coursesTab.historyUnavailable')}
            </Text>
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {container
                ? [container.difficultyLevel, date ? t('coursesTab.historyFinished', { date }) : null]
                    .filter(Boolean)
                    .join(' · ')
                : t('coursesTab.historyUnavailableNote')}
            </Text>
          </View>
        );
        const box = {
          backgroundColor: colors.surface,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
        };
        return container ? (
          <PressableScale
            key={enrollment.id}
            onPress={() => onOpen(container.id)}
            accessibilityRole="button"
            accessibilityLabel={container.title}
            style={box}
          >
            {body}
          </PressableScale>
        ) : (
          <View key={enrollment.id} testID="history-unavailable" style={box}>
            {body}
          </View>
        );
      })}
    </View>
  );
}
