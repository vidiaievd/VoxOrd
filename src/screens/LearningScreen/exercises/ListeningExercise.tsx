import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useListening } from '../../../hooks/useListening';
import type { ExerciseTracking } from '../../../hooks/exerciseTracking';
import { useAutoAdvance } from '../../../hooks/useAutoAdvance';

interface ListeningExerciseProps {
  deckId: number;
  overrideWordIds?: number[];
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
  onComplete?: (correctCount: number) => void;
  /** Optional per-answer instrumentation; used by course review sessions. */
  tracking?: ExerciseTracking;
}

export function ListeningExercise({
  deckId,
  overrideWordIds,
  onBack,
  onSessionDone,
  onComplete,
  tracking,
}: ListeningExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, isLoading, sessionId, speak, selectOption, next, installTts } =
    useListening(deckId, overrideWordIds, onComplete, tracking);

  // A phase inside a larger session must not dead-end on an empty question set
  // (e.g. spelling now skips phrases, so a phrase-only set yields nothing).
  // Report it as finished so the session moves on instead of stranding the user
  // on a "no words" screen with only a back button.
  useEffect(() => {
    if (!isLoading && state.questions.length === 0 && onComplete) {
      onComplete(0);
    }
  }, [isLoading, state.questions.length, onComplete]);

  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  // TTS engine not installed
  if (state.ttsStatus === 'no_engine') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>🔇</Text>
          <Text style={styles.errorTitle}>No TTS engine found</Text>
          <Text style={styles.errorText}>
            A text-to-speech engine is required for this mode.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={installTts}>
            <Text style={styles.primaryBtnText}>Install TTS engine</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // TTS init error
  if (state.ttsStatus === 'error') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>TTS unavailable</Text>
          <Text style={styles.errorText}>
            Could not initialize text-to-speech on this device.
          </Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading || state.ttsStatus === 'initializing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {state.ttsStatus === 'initializing'
            ? 'Initializing audio...'
            : 'Loading...'}
        </Text>
      </View>
    );
  }

  if (state.questions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Not enough words to start listening.
          </Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Results screen
  if (state.isComplete && onComplete) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (state.isComplete) {
    const total = state.questions.length;
    const correct = state.correctCount;
    const accuracy = Math.round((correct / total) * 100);
    const emoji = accuracy >= 80 ? '👂' : accuracy >= 50 ? '🎧' : '🔉';

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{emoji}</Text>
          <Text style={styles.resultTitle}>
            {accuracy >= 80
              ? 'Great listening!'
              : accuracy >= 50
              ? 'Good effort!'
              : 'Keep listening!'}
          </Text>
          <Text style={styles.resultScore}>
            {correct} / {total}
          </Text>
          <Text style={styles.resultAccuracy}>{accuracy}% accuracy</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => onSessionDone(sessionId ?? 0)}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const question = state.questions[state.currentIndex];
  const progress =
    state.totalWords > 0 ? state.correctCount / state.totalWords : 0;

  const getOptionStyle = (option: string) => {
    if (!state.isAnswered) return styles.option;
    if (option === question.correctAnswer) return styles.optionCorrect;
    if (option === state.selectedOption) return styles.optionWrong;
    return styles.optionDimmed;
  };

  const getOptionTextStyle = (option: string) => {
    if (!state.isAnswered) return styles.optionText;
    if (option === question.correctAnswer) return styles.optionTextCorrect;
    if (option === state.selectedOption) return styles.optionTextWrong;
    return styles.optionTextDimmed;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBack}>
          <Text style={styles.headerBackText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Listening</Text>
        <Text style={styles.headerCount}>
          {state.correctCount}/{state.totalWords}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Speaker button */}
      <View style={styles.speakerContainer}>
        <Text style={styles.questionLabel}>Listen and select the meaning</Text>
        <TouchableOpacity
          style={[
            styles.speakerBtn,
            state.isSpeaking && styles.speakerBtnActive,
          ]}
          onPress={speak}
          activeOpacity={0.8}
        >
          <Text style={styles.speakerIcon}>
            {state.isSpeaking ? '🔊' : '🔈'}
          </Text>
          <Text
            style={[
              styles.speakerText,
              state.isSpeaking && styles.speakerTextActive,
            ]}
          >
            {state.isSpeaking ? 'Playing...' : 'Tap to listen'}
          </Text>
        </TouchableOpacity>

        {/* Reveal word after answering */}
        {state.isAnswered && (
          <Text style={styles.revealedWord}>{question.word}</Text>
        )}
      </View>

      {/* Options */}
      <View style={styles.options}>
        {question.options.map(option => (
          <TouchableOpacity
            key={option}
            style={getOptionStyle(option)}
            onPress={() => selectOption(option)}
            disabled={state.isAnswered}
            activeOpacity={0.75}
          >
            <Text style={getOptionTextStyle(option)}>{option}</Text>
            {state.isAnswered && option === question.correctAnswer && (
              <Text style={styles.optionIcon}>✓</Text>
            )}
            {state.isAnswered &&
              option === state.selectedOption &&
              option !== question.correctAnswer && (
                <Text style={styles.optionIcon}>✗</Text>
              )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Next button */}
      {state.isAnswered && state.isCorrect === false && (
        <View style={styles.nextContainer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={next}>
            <Text style={styles.primaryBtnText}>
              {state.currentIndex + 1 >= state.questions.length && !onComplete
                ? 'See results'
                : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textMuted,
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
      marginBottom: 24,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 3,
    },
    speakerContainer: {
      alignItems: 'center',
      paddingHorizontal: 24,
      marginBottom: 32,
    },
    questionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 20,
    },
    speakerBtn: {
      width: 140,
      height: 140,
      borderRadius: 70,
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
    speakerBtnActive: {
      backgroundColor: colors.accent,
      shadowOpacity: 0.4,
      elevation: 8,
    },
    speakerIcon: {
      fontSize: 48,
      marginBottom: 4,
    },
    speakerText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    speakerTextActive: {
      color: '#fff',
    },
    revealedWord: {
      marginTop: 16,
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: 1,
    },
    options: {
      paddingHorizontal: 20,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: 'transparent',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    optionCorrect: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.success,
      elevation: 0,
    },
    optionWrong: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255, 59, 48, 0.10)',
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.error,
      elevation: 0,
    },
    optionDimmed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: 'transparent',
      opacity: 0.4,
      elevation: 0,
    },
    optionText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    optionTextCorrect: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.success,
      flex: 1,
    },
    optionTextWrong: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.error,
      flex: 1,
    },
    optionTextDimmed: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textMuted,
      flex: 1,
    },
    optionIcon: {
      fontSize: 18,
      fontWeight: '700',
    },
    nextContainer: {
      position: 'absolute',
      bottom: 32,
      left: 20,
      right: 20,
    },
    errorEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 48,
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    outlineBtn: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    outlineBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    resultContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    resultEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    resultTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    resultScore: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.accent,
      marginBottom: 4,
    },
    resultAccuracy: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 40,
    },
  });
