import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { SubmitAttemptResponse } from '../../api/exercises';
import { feedbackLine } from './feedbackLine';

interface FeedbackBarProps {
  verdict: SubmitAttemptResponse;
}

type FeedbackTone = 'correct' | 'incorrect' | 'review' | 'unread';

function toneFor(verdict: SubmitAttemptResponse): FeedbackTone {
  // Free-form templates (translate_*, writing_task) route to human review:
  // don't present them as right/wrong. With nobody to review them (plan 79, step 2.1c)
  // «submitted for review» would be a promise no one keeps.
  if (verdict.requiresReview) return verdict.reviewer === 'none' ? 'unread' : 'review';
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
        : tone === 'unread'
          ? t('exerciseRunner.noReviewer')
          : t('exerciseRunner.submittedForReview');
  // The engine's own words are English stock phrases; see `feedbackLine`.
  const line = feedbackLine(verdict.feedback.summary);

  return (
    <View style={[styles.bar, { backgroundColor: `${toneColor}1A`, borderColor: toneColor }]}>
      <Text style={[styles.title, { color: toneColor }]}>{title}</Text>
      {line.kind === 'expected' ? (
        <Text style={styles.summary}>
          {t('exerciseRunner.expectedAnswer', { answer: line.answer })}
        </Text>
      ) : line.kind === 'text' ? (
        <Text style={styles.summary}>{line.text}</Text>
      ) : tone === 'review' ? (
        <Text style={styles.summary}>{t('exerciseRunner.reviewNote')}</Text>
      ) : tone === 'unread' ? (
        <Text style={styles.summary}>{t('exerciseRunner.noReviewerNote')}</Text>
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
