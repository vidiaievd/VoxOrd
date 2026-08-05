import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useContext } from '../../../hooks/useContext';
import { useAutoAdvance } from '../../../hooks/useAutoAdvance';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';

interface ContextExerciseProps {
  deckId: number;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

const GAP_MARKER = '___';

// Split sentence into parts around the gap
function renderSentenceParts(sentence: string, filledWord?: string) {
  const parts = sentence.split(GAP_MARKER);
  return { before: parts[0] ?? '', after: parts[1] ?? '', filledWord };
}

export function ContextExercise({
  deckId,
  onBack,
  onSessionDone,
}: ContextExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // Context is only ever run standalone — neither CourseReviewPhase nor Deep
  // Session's PHASE_ORDER includes it — so it always owns its session.
  const session = useOwnedTracking(deckId, 'context');
  const { state, isLoading, sessionId, selectOption, next } =
    useContext(deckId, session);
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
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>No context sentences yet</Text>
          <Text style={styles.emptyText}>
            This deck does not have enough example sentences for context mode.
          </Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Results screen
  if (state.isComplete) {
    const total = state.questions.length;
    const correct = state.correctCount;
    const accuracy = Math.round((correct / total) * 100);
    const emoji = accuracy >= 80 ? '📖' : accuracy >= 50 ? '📝' : '✏️';

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{emoji}</Text>
          <Text style={styles.resultTitle}>
            {accuracy >= 80
              ? 'Great context skills!'
              : accuracy >= 50
              ? 'Good effort!'
              : 'Keep practicing!'}
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
  const progress = (state.currentIndex + 1) / state.questions.length;
  const filled = state.isAnswered ? question.correctAnswer : undefined;
  const parts = renderSentenceParts(question.sentence, filled);

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
        <Text style={styles.headerTitle}>Context</Text>
        <Text style={styles.headerCount}>
          {state.currentIndex + 1}/{state.questions.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Instruction */}
        <Text style={styles.instruction}>Fill in the missing word</Text>

        {/* Sentence card */}
        <View style={styles.sentenceCard}>
          <Text style={styles.sentenceText}>
            <Text>{parts.before}</Text>
            {state.isAnswered ? (
              <Text
                style={[
                  styles.sentenceGapFilled,
                  state.isCorrect
                    ? { color: colors.success }
                    : { color: colors.error },
                ]}
              >
                {parts.filledWord}
              </Text>
            ) : (
              <Text style={styles.sentenceGap}>{GAP_MARKER}</Text>
            )}
            <Text>{parts.after}</Text>
          </Text>

          {/* Translation hint */}
          <Text style={styles.sentenceTranslation}>
            {question.sentenceTranslation}
          </Text>
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
          <TouchableOpacity style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextBtnText}>
              {state.currentIndex + 1 >= state.questions.length
                ? 'See results'
                : 'Next →'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
      marginBottom: 20,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 3,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    instruction: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: 16,
    },
    sentenceCard: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 20,
      marginBottom: 24,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    sentenceText: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 34,
      textAlign: 'center',
      marginBottom: 12,
    },
    sentenceGap: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.accent,
      textDecorationLine: 'underline',
    },
    sentenceGapFilled: {
      fontSize: 22,
      fontWeight: '800',
    },
    sentenceTranslation: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      fontStyle: 'italic',
    },
    options: {
      marginBottom: 16,
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
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
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
    primaryBtn: {
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
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
