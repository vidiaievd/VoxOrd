import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';

interface DeepSessionCompleteScreenProps {
  totalWords: number;
  correctTotal: number;
  phaseIndex: number;
  sessionId: number | null;
  onSessionDone: (sessionId: number) => void;
}

export function DeepSessionCompleteScreen({
  totalWords,
  correctTotal,
  phaseIndex,
  sessionId,
  onSessionDone,
}: DeepSessionCompleteScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const accuracy =
    totalWords > 0 ? Math.round((correctTotal / totalWords) * 100) : 100;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.title}>Deep session complete!</Text>
        <Text style={styles.message}>
          You worked through all phases. Your memory for these words is now much
          stronger.
        </Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totalWords}</Text>
            <Text style={styles.statLabel}>Words</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{accuracy}%</Text>
            <Text style={styles.statLabel}>Final accuracy</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.accent }]}>
              {phaseIndex - 1}
            </Text>
            <Text style={styles.statLabel}>Phases done</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => onSessionDone(sessionId ?? 0)}
        >
          <Text style={styles.btnText}>See full results →</Text>
        </TouchableOpacity>
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
    emoji: {
      fontSize: 72,
      marginBottom: 16,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    stats: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 20,
      marginBottom: 32,
      width: '100%',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    stat: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: 'center',
    },
    statDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 48,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    btnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
