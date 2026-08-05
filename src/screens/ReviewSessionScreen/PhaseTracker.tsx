import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { CourseReviewPhase } from '../../lib/courseReviewSet';

const PHASE_KEY: Record<CourseReviewPhase, string> = {
  preview: 'review.phasePreview',
  listening: 'review.phaseListening',
  quiz: 'review.phaseQuiz',
  spelling: 'review.phaseSpelling',
};

interface PhaseTrackerProps {
  phase: CourseReviewPhase | null;
  phaseIndex: number;
  totalPhases: number;
}

/**
 * Shows where the session is. Phases are planned per set — a small deck runs
 * spelling only — so the count is whatever this session actually has, not a
 * fixed four.
 */
export function PhaseTracker({ phase, phaseIndex, totalPhases }: PhaseTrackerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (!phase) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <Text style={styles.label} numberOfLines={1}>
        {t(PHASE_KEY[phase])}
      </Text>
      <Text style={styles.counter}>
        {phaseIndex + 1}/{totalPhases}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      minWidth: 70,
      alignItems: 'flex-end',
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    counter: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  });
