import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { SubmitAttemptResponse } from '../../api/exercises';

interface FeedbackBarProps {
  verdict: SubmitAttemptResponse;
}

type FeedbackTone = 'correct' | 'incorrect' | 'review';

function toneFor(verdict: SubmitAttemptResponse): FeedbackTone {
  // Free-form templates (translate_*, writing_task) route to human review:
  // don't present them as right/wrong.
  if (verdict.requiresReview) return 'review';
  return verdict.correct ? 'correct' : 'incorrect';
}

export function FeedbackBar({ verdict }: FeedbackBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const tone = toneFor(verdict);
  const toneColor =
    tone === 'correct' ? colors.success : tone === 'incorrect' ? colors.danger : colors.warning;
  const title =
    tone === 'correct'
      ? t('exerciseRunner.correct')
      : tone === 'incorrect'
        ? t('exerciseRunner.incorrect')
        : t('exerciseRunner.submittedForReview');

  return (
    <View style={[styles.bar, { backgroundColor: `${toneColor}1A`, borderColor: toneColor }]}>
      <Text style={[styles.title, { color: toneColor }]}>{title}</Text>
      {verdict.feedback.summary ? (
        <Text style={styles.summary}>{verdict.feedback.summary}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    bar: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 4,
    },
    summary: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });
