import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';
import { useTranslation } from '../../../i18n';

interface StudyNowSectionProps {
  localDue: number;
  courseDue: number;
  onReviewCourse: () => void;
}

/**
 * The single "what to study now" widget on Home — aggregates local-deck due
 * words (drilled per-deck below, via the due badge in DeckGroupsSection) and
 * server-authoritative course words (drilled here, via ReviewSessionScreen).
 * Rendered only when there is something due; the caller decides that.
 */
export function StudyNowSection({ localDue, courseDue, onReviewCourse }: StudyNowSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('home.studyNow.title')}</Text>

      {courseDue > 0 && (
        <TouchableOpacity style={styles.row} onPress={onReviewCourse} activeOpacity={0.8}>
          <Text style={styles.icon}>🎓</Text>
          <Text style={styles.label}>{t('home.studyNow.courseDue', { count: courseDue })}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}

      {localDue > 0 && (
        <View style={styles.row}>
          <Text style={styles.icon}>📚</Text>
          <Text style={styles.label}>{t('home.studyNow.localDue', { count: localDue })}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: 24,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 2,
    },
    icon: {
      fontSize: 22,
      marginRight: 12,
    },
    label: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    chevron: {
      fontSize: 20,
      color: colors.textMuted,
    },
  });
