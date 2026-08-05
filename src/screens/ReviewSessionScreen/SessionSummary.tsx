import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { REVIEW_RATINGS, type ReviewRating } from '../../api/srs';
import { useReviewQueue } from '../../hooks/useReviewQueue';

const RATING_KEY: Record<ReviewRating, string> = {
  AGAIN: 'review.again',
  HARD: 'review.hard',
  GOOD: 'review.good',
  EASY: 'review.easy',
};

interface SessionSummaryProps {
  submitted: Array<{ wordId: number; rating: ReviewRating }>;
  ungradedCount: number;
  onDone: () => void;
}

/**
 * What the session decided, shown after the fact.
 *
 * The user never picks a rating — this is the first and only place ratings are
 * surfaced, so that the derivation stays visible rather than magic.
 */
export function SessionSummary({ submitted, ungradedCount, onDone }: SessionSummaryProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const pendingCount = useReviewQueue();

  const counts = REVIEW_RATINGS.map((rating) => ({
    rating,
    count: submitted.filter((entry) => entry.rating === rating).length,
  })).filter((entry) => entry.count > 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('review.sessionDone')}</Text>
      <Text style={styles.message}>
        {t('review.reviewedCount', { count: submitted.length })}
      </Text>

      {counts.length > 0 && (
        <View style={styles.breakdown}>
          {counts.map(({ rating, count }) => (
            <View key={rating} style={styles.row}>
              <Text style={styles.rowLabel}>{t(RATING_KEY[rating])}</Text>
              <Text style={styles.rowCount}>{count}</Text>
            </View>
          ))}
        </View>
      )}

      {ungradedCount > 0 && (
        // Words that were never answered stay due on purpose — reporting them
        // is honest, and the alternative (a default rating) would corrupt the
        // schedule.
        <Text style={styles.message}>
          {t('review.stillDue', { count: ungradedCount })}
        </Text>
      )}

      {pendingCount > 0 && (
        <Text style={styles.pending}>
          {t('review.pendingSync', { count: pendingCount })}
        </Text>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={onDone} activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      alignSelf: 'stretch',
      gap: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    breakdown: {
      alignSelf: 'stretch',
      backgroundColor: colors.backgroundCard,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    rowLabel: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    rowCount: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    pending: {
      fontSize: 13,
      color: colors.warning,
      textAlign: 'center',
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    primaryButtonText: {
      color: colors.textInverted,
      fontSize: 16,
      fontWeight: '600',
    },
  });
