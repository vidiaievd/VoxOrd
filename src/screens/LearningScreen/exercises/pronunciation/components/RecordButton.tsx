import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../../theme/colors';
import { RecordingState } from '../../../../../hooks/usePronunciation';

interface RecordButtonProps {
  recordingState: RecordingState;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
  isDeepSession: boolean;
}

export function RecordButton({
  recordingState,
  onStart,
  onStop,
  onRetry,
  onNext,
  onSkip,
  isLast,
  isDeepSession,
}: RecordButtonProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (recordingState === 'idle') {
    return (
      <View style={styles.idleContainer}>
        <TouchableOpacity
          style={styles.recordBtn}
          onPress={onStart}
          activeOpacity={0.8}
        >
          <Text style={styles.recordBtnIcon}>🎤</Text>
          <Text style={styles.recordBtnText}>Tap to speak</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={onSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipBtnText}>Skip →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (recordingState === 'listening') {
    return (
      <TouchableOpacity
        style={[styles.recordBtn, styles.recordBtnActive]}
        onPress={onStop}
        activeOpacity={0.8}
      >
        <Text style={styles.recordBtnIcon}>⏹</Text>
        <Text style={[styles.recordBtnText, { color: colors.error }]}>
          Tap to stop
        </Text>
      </TouchableOpacity>
    );
  }

  if (recordingState === 'processing') {
    return (
      <View style={styles.processingBox}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.processingText}>Processing...</Text>
      </View>
    );
  }

  // result state
  return (
    <View style={styles.resultActions}>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>↩ Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
        <Text style={styles.nextBtnText}>
          {isLast && !isDeepSession ? 'See results' : 'Next →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    idleContainer: {
      alignItems: 'center',
    },
    recordBtn: {
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.accent,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 4,
    },
    recordBtnActive: {
      backgroundColor: 'rgba(255, 59, 48, 0.15)',
      borderColor: colors.error,
    },
    recordBtnIcon: {
      fontSize: 52,
      marginBottom: 4,
    },
    recordBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    skipBtn: {
      marginTop: 12,
      padding: 8,
    },
    skipBtnText: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500',
    },
    processingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    processingText: {
      fontSize: 15,
      color: colors.textMuted,
    },
    resultActions: {
      flexDirection: 'row',
      gap: 12,
    },
    retryBtn: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    retryBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    nextBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 32,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    nextBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
  });
