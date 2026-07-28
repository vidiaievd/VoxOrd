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
import { useQuiz } from '../../../hooks/useQuiz';
import type { ExerciseTracking } from '../../../hooks/exerciseTracking';
import { useAutoAdvance } from '../../../hooks/useAutoAdvance';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';

interface QuizExerciseProps {
  deckId: number;
  overrideWordIds?: number[];
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
  onComplete?: (correctCount: number) => void;
  /** Optional per-answer instrumentation; used by course review sessions. */
  tracking?: ExerciseTracking;
}

export function QuizExercise({
  deckId,
  overrideWordIds,
  onBack,
  onSessionDone,
  onComplete,
  tracking,
}: QuizExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // No tracking from above means this screen is the whole sitting, so it owns
  // the session that schedules its words.
  const session = useOwnedTracking(deckId, 'quiz', tracking);
  const { state, isLoading, sessionId, selectOption, next } = useQuiz(
    deckId,
    overrideWordIds,
    onComplete,
    session,
  );

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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (state.questions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Not enough words to start a quiz.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Go back</Text>
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
    const emoji = accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪';

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{emoji}</Text>
          <Text style={styles.resultTitle}>
            {accuracy >= 80
              ? 'Excellent!'
              : accuracy >= 50
              ? 'Good job!'
              : 'Keep going!'}
          </Text>
          <Text style={styles.resultScore}>
            {correct} / {total}
          </Text>
          <Text style={styles.resultAccuracy}>{accuracy}% accuracy</Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => onSessionDone(sessionId ?? 0)}
          >
            <Text style={styles.doneBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const question = state.questions[state.currentIndex];
  const progress =
    state.questions.length > 0
      ? state.correctCount / state.questions.length
      : 0;

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
        <Text style={styles.headerTitle}>Quick Quiz</Text>
        <Text style={styles.headerCount}>
          {state.correctCount}/{state.totalWords}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Question */}
      <View style={styles.questionContainer}>
        <Text style={styles.questionLabel}>What does this mean?</Text>
        <Text style={styles.questionWord}>{question.word}</Text>
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

      {/* Next button — visible after answer */}
      {state.isAnswered && state.isCorrect === false && (
        <View style={styles.nextContainer}>
          <TouchableOpacity style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextBtnText}>
              {state.currentIndex + 1 >= state.questions.length
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
    questionContainer: {
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
      marginBottom: 12,
    },
    questionWord: {
      fontSize: 36,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
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
      color: colors.textPrimary,
    },
    nextContainer: {
      position: 'absolute',
      bottom: 32,
      left: 20,
      right: 20,
    },
    nextBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    nextBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    emptyText: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 24,
    },
    backBtn: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    backBtnText: {
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
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
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
    doneBtn: {
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
    doneBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
