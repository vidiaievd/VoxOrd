import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';
import {
  usePronunciation,
  PronunciationMode,
} from '../../../../hooks/usePronunciation';

import { PronunciationCard } from './components/PronunciationCard';
import { TranscriptBox } from './components/TranscriptBox';
import { ScoreDisplay } from './components/ScoreDisplay';
import { RecordButton } from './components/RecordButton';
import { PronunciationResultScreen } from './PronunciationResultScreen';

interface PronunciationExerciseProps {
  deckId: number;
  mode?: PronunciationMode;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
  onComplete?: (correctCount: number) => void;
}

export function PronunciationExercise({
  deckId,
  mode = 'mixed',
  onBack,
  onSessionDone,
  onComplete,
}: PronunciationExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { state, isLoading, speak, startRecord, stopRecord, next, retry, skip } =
    usePronunciation(deckId, mode, undefined, onComplete);

  // Auto-speak when item changes
  useEffect(() => {
    if (!isLoading && state.ttsReady && state.items.length > 0) {
      const timer = setTimeout(speak, 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, state.currentIndex, state.ttsReady]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (state.items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>No items to practice.</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Deep session transition
  if (state.isComplete && onComplete) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Standalone result screen
  if (state.isComplete) {
    return (
      <PronunciationResultScreen
        correctCount={state.correctCount}
        totalItems={state.totalItems}
        onContinue={() => onSessionDone(0)}
      />
    );
  }

  const item = state.items[state.currentIndex];
  const progress =
    state.totalItems > 0 ? state.correctCount / state.totalItems : 0;
  const isLast = state.currentIndex + 1 >= state.items.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBack}>
          <Text style={styles.headerBackText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pronunciation</Text>
        <Text style={styles.headerCount}>
          {state.correctCount}/{state.totalItems}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Badge row */}
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.type === 'word' ? '📝 Word' : '💬 Phrase'}
          </Text>
        </View>
        <Text style={styles.difficultyText}>
          {'★'.repeat(item.difficulty)}
          {'☆'.repeat(3 - item.difficulty)}
        </Text>
      </View>

      {/* Card */}
      <PronunciationCard
        item={item}
        isSpeaking={state.isSpeaking}
        showText={state.recordingState === 'result'}
        onSpeak={speak}
      />

      {/* Transcript */}
      {state.transcript !== null && (
        <TranscriptBox transcript={state.transcript} />
      )}

      {/* Score */}
      {state.score !== null && <ScoreDisplay score={state.score} />}

      {/* Error */}
      {state.error !== null && (
        <Text style={styles.errorText}>⚠️ {state.error}</Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <RecordButton
          recordingState={state.recordingState}
          onStart={startRecord}
          onStop={stopRecord}
          onRetry={retry}
          onNext={next}
          onSkip={skip}
          isLast={isLast}
          isDeepSession={!!onComplete}
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
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerBack: {
      padding: 8,
    },
    headerBackText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerCount: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
    },
    progressBg: {
      height: 6,
      backgroundColor: colors.border,
      marginHorizontal: 20,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 16,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 3,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    badge: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    difficultyText: {
      fontSize: 14,
      color: colors.accent,
    },
    controls: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      alignItems: 'center',
      marginTop: 'auto',
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      textAlign: 'center',
      marginHorizontal: 20,
      marginBottom: 12,
    },
    outlineBtn: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    outlineBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
