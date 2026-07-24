import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import type { UnitContentsItem } from '../../api/types';

interface ContentItemRowProps {
  item: UnitContentsItem;
  /**
   * Lessons (Phase 3 reader) and exercises (Phase 4 runner) are tappable.
   * Vocabulary lists and grammar rules stay inert until Phase 5/6.
   */
  onPress?: () => void;
}

const ICON_BY_CONTENT_TYPE: Record<string, string> = {
  lesson: '📖',
  vocabulary_list: '🔤',
  grammar_rule: '📐',
  exercise: '✏️',
};

export function ContentItemRow({ item, onPress }: ContentItemRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const locked = item.status === 'locked';

  const badge = {
    completed: { label: t('unitContents.statusCompleted'), color: colors.success },
    in_progress: { label: t('unitContents.statusInProgress'), color: colors.accent },
    available: { label: t('unitContents.statusAvailable'), color: colors.textMuted },
    locked: { label: t('unitContents.statusLocked'), color: colors.textMuted },
  }[item.status];

  const icon = ICON_BY_CONTENT_TYPE[item.contentType] ?? '📄';

  const content = (
    <>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title ?? t('unitContents.untitled')}
        </Text>
        {item.durationMinutes !== null && (
          <Text style={styles.meta}>
            {t('unitContents.duration', { minutes: item.durationMinutes })}
          </Text>
        )}
      </View>
      <View style={[styles.badge, { backgroundColor: `${badge.color}22` }]}>
        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
      </View>
    </>
  );

  if (onPress && !locked) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.row, locked && styles.rowLocked]}>{content}</View>;
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      padding: 12,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    rowLocked: {
      opacity: 0.6,
    },
    icon: {
      fontSize: 20,
      marginRight: 10,
    },
    info: {
      flex: 1,
      marginRight: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    meta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    badge: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
  });
