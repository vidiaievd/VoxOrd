import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { ColorScheme } from '../../theme/colors';
import { REVIEW_RATINGS, type ReviewRating } from '../../api/srs';

interface RatingButtonsProps {
  /** Server-computed interval per rating; missing entries render no label. */
  predicted: Partial<Record<ReviewRating, string>>;
  onRate: (rating: ReviewRating) => void;
}

const LABEL_KEY: Record<ReviewRating, 'again' | 'hard' | 'good' | 'easy'> = {
  AGAIN: 'again',
  HARD: 'hard',
  GOOD: 'good',
  EASY: 'easy',
};

/**
 * The four FSRS ratings, in the order the server enumerates them. The interval
 * under each button is the server's prediction — the client never computes one.
 */
export function RatingButtons({ predicted, onRate }: RatingButtonsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  const tint: Record<ReviewRating, string> = {
    AGAIN: colors.danger,
    HARD: colors.warning,
    GOOD: colors.accent,
    EASY: colors.success,
  };

  return (
    <View style={styles.row}>
      {REVIEW_RATINGS.map((rating) => (
        <TouchableOpacity
          key={rating}
          style={[styles.button, { borderColor: tint[rating] }]}
          onPress={() => onRate(rating)}
          activeOpacity={0.7}
        >
          <Text style={[styles.label, { color: tint[rating] }]}>
            {t(`review.${LABEL_KEY[rating]}`)}
          </Text>
          {!!predicted[rating] && <Text style={styles.interval}>{predicted[rating]}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    button: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
    },
    interval: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
