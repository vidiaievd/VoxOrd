import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';
import {
  DeepPhase,
  PHASE_LABELS,
  PHASE_ORDER,
} from '../../../../hooks/useDeepSession';

interface PhaseHeaderProps {
  phase: DeepPhase;
  phaseIndex: number;
  totalPhases: number;
}

export function PhaseHeader({
  phase,
  phaseIndex,
  totalPhases,
}: PhaseHeaderProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const phaseInfo = PHASE_LABELS[phase];

  return (
    <View style={styles.container}>
      <Text style={styles.phaseStep}>
        Phase {phaseIndex} of {totalPhases}
      </Text>

      <View style={styles.phaseDots}>
        {PHASE_ORDER.map((p, i) => (
          <View key={p} style={styles.phaseDotWrapper}>
            <View
              style={[
                styles.phaseDot,
                phase === p && styles.phaseDotActive,
                phaseIndex > i + 1 && styles.phaseDotDone,
              ]}
            />
            <Text
              style={[
                styles.phaseDotLabel,
                phase === p && styles.phaseDotLabelActive,
                phaseIndex > i + 1 && styles.phaseDotLabelDone,
              ]}
            >
              {PHASE_LABELS[p].icon}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.phaseLabel}>
        {phaseInfo.icon} {phaseInfo.label}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    phaseStep: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    phaseDots: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    phaseDotWrapper: {
      alignItems: 'center',
      marginHorizontal: 8,
    },
    phaseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      marginBottom: 4,
    },
    phaseDotActive: {
      backgroundColor: colors.accent,
      width: 20,
    },
    phaseDotDone: {
      backgroundColor: colors.success,
      width: 20,
    },
    phaseDotLabel: {
      fontSize: 14,
      opacity: 0.4,
    },
    phaseDotLabelActive: {
      opacity: 1,
    },
    phaseDotLabelDone: {
      opacity: 0.8,
    },
    phaseLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
