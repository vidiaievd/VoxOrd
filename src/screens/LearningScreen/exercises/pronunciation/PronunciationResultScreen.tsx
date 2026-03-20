import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';

interface PronunciationResultScreenProps {
  correctCount: number;
  totalItems: number;
  onContinue: () => void;
}

export function PronunciationResultScreen({
  correctCount,
  totalItems,
  onContinue,
}: PronunciationResultScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const accuracy =
    totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;
  const emoji = accuracy >= 80 ? '🎤' : accuracy >= 50 ? '🗣️' : '📢';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>
          {accuracy >= 80
            ? 'Great pronunciation!'
            : accuracy >= 50
            ? 'Good effort!'
            : 'Keep practicing!'}
        </Text>
        <Text style={styles.score}>
          {correctCount} / {totalItems}
        </Text>
        <Text style={styles.accuracy}>{accuracy}% accuracy</Text>

        <TouchableOpacity style={styles.btn} onPress={onContinue}>
          <Text style={styles.btnText}>Continue</Text>
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
      fontSize: 64,
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    score: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.accent,
      marginBottom: 4,
    },
    accuracy: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 40,
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
