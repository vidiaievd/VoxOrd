import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Tag } from '../../../components/ui';
import { useCatalog } from '../../../hooks/useCatalog';
import { useTranslation } from '../../../i18n';
import { catalogPicks } from '../../../lib/catalog';
import { useTheme } from '../../../providers/ThemeProvider';
import { spacing } from '../../../theme/spacing';
import type { DifficultyLevel } from '../../../api/types';
import { useRegisterRefresh } from '../refresh';

const CARD_WIDTH = 220;

interface CatalogPicksProps {
  /** The level of the course «Continue» leads into — the learner has no level of their own. */
  level: DifficultyLevel | null;
  enrolledIds: ReadonlySet<string>;
  onOpenCatalog: () => void;
  onOpenCourse: (containerId: string) => void;
}

/**
 * Block 12 (Home spec §6.2): catalogue courses the learner does not hold, at their course's
 * level. Not rendered when there are none.
 */
export function CatalogPicks({ level, enrolledIds, onOpenCatalog, onOpenCourse }: CatalogPicksProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { data, refresh } = useCatalog();
  useRegisterRefresh(refresh);

  const picks = useMemo(() => catalogPicks(data ?? [], enrolledIds, level), [data, enrolledIds, level]);
  if (picks.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[typography.cardTitleMedium, { color: colors.text }]}>
          {level ? t('catalog.picksTitle', { level }) : t('catalog.picksTitleNoLevel')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCatalog}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Text style={[typography.secondary, { color: colors.accent300 }]}>{t('coursesTab.catalog')}</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={picks}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + 10}
        decelerationRate="fast"
        style={{ marginHorizontal: -spacing.screenGutter }}
        contentContainerStyle={{ paddingHorizontal: spacing.screenGutter, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenCourse(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.difficultyLevel}`}
            style={({ pressed }) => ({
              width: CARD_WIDTH,
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 14,
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Tag label={item.difficultyLevel} />
            <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.description ? (
              <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
