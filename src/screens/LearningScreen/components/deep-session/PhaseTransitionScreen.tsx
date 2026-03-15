import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';
import {
  DeepPhase,
  PHASE_LABELS,
  getNextPhase,
} from '../../../../hooks/useDeepSession';

interface PhaseTransitionScreenProps {
  lastPhase: DeepPhase;
  lastPhaseCorrect: number;
  totalWords: number;
}

export function PhaseTransitionScreen({
  lastPhase,
  lastPhaseCorrect,
  totalWords,
}: PhaseTransitionScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const finished = PHASE_LABELS[lastPhase];
  const next = PHASE_LABELS[getNextPhase(lastPhase)];
  const accuracy =
    totalWords > 0 ? Math.round((lastPhaseCorrect / totalWords) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.doneIcon}>{finished.icon}</Text>
        <Text style={styles.doneLabel}>{finished.label} complete!</Text>
        <Text style={styles.accuracy}>{accuracy}% accuracy</Text>

        <View style={styles.arrow}>
          <Text style={styles.arrowText}>↓</Text>
        </View>

        <Text style={styles.nextLabel}>Up next</Text>
        <Text style={styles.nextIcon}>{next.icon}</Text>
        <Text style={styles.nextTitle}>{next.label}</Text>

        <ActivityIndicator
          style={styles.loader}
          size="small"
          color={colors.accent}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    doneIcon: {
      fontSize: 64,
      marginBottom: 8,
    },
    doneLabel: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    accuracy: {
      fontSize: 16,
      color: colors.textMuted,
      marginBottom: 24,
    },
    arrow: {
      marginBottom: 24,
    },
    arrowText: {
      fontSize: 28,
      color: colors.accent,
    },
    nextLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    nextIcon: {
      fontSize: 48,
      marginBottom: 4,
    },
    nextTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.accent,
    },
    loader: {
      marginTop: 32,
    },
  });
