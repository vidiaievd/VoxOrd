import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { CourseListItem } from '../../api/courses';

interface CourseCardProps {
  item: CourseListItem;
  onPress: () => void;
}

export function CourseCard({ item, onPress }: CourseCardProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { container } = item;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {container.title}
        </Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>{container.difficultyLevel}</Text>
        </View>
      </View>
      {container.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {container.description}
        </Text>
      ) : null}
      <Text style={styles.language}>{container.targetLanguage.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.backgroundCard,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 3,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginRight: 8,
    },
    levelBadge: {
      backgroundColor: colors.accentLight,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    levelText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
    description: {
      marginTop: 6,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    language: {
      marginTop: 10,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
