import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useSpelling } from '../../../hooks/useSpelling';
import type { ExerciseTracking } from '../../../hooks/exerciseTracking';
import { useAutoAdvance } from '../../../hooks/useAutoAdvance';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';

interface SpellingExerciseProps {
  deckId: number;
  overrideWordIds?: number[];
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
  onComplete?: (correctCount: number) => void;
  /** Optional per-answer instrumentation; used by course review sessions. */
  tracking?: ExerciseTracking;
}

export function SpellingExercise({
  deckId,
  overrideWordIds,
  onBack,
  onSessionDone,
  onComplete,
  tracking,
}: SpellingExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // No tracking from above means this screen is the whole sitting, so it owns
  // the session that schedules its words.
  const session = useOwnedTracking(deckId, 'spelling', tracking);
  const { state, isLoading, sessionId, setInput, submit, skip, next } =
    useSpelling(deckId, overrideWordIds, onComplete, session);

  // A phase inside a larger session must not dead-end on an empty question set
  // (e.g. spelling now skips phrases, so a phrase-only set yields nothing).
  // Report it as finished so the session moves on instead of stranding the user
  // on a "no words" screen with only a back button.
  useEffect(() => {
    if (!isLoading && state.questions.length === 0 && onComplete) {
      onComplete(0);
    }
  }, [isLoading, state.questions.length, onComplete]);

  const inputRef = useRef<TextInput>(null);
  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  // Auto-focus on each new question
  useEffect(() => {
    if (!isLoading && !state.isAnswered && !state.isSkipped) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading, state.currentIndex, state.isAnswered, state.isSkipped]);

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
          <Text style={styles.emptyText}>No words available for spelling.</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={onBack}>
            <Text style={styles.outlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Results screen
  if (state.isComplete && onComplete) {
    console.log('[[completed block]]');
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (state.isComplete) {
    const total = state.questions.length;
    const correct = state.correctCount;
    const skipped = state.skippedCount;
    const accuracy = Math.round((correct / total) * 100);
    const emoji = accuracy >= 80 ? '🏆' : accuracy >= 50 ? '✍️' : '📝';

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{emoji}</Text>
          <Text style={styles.resultTitle}>
            {accuracy >= 80
              ? 'Perfect spelling!'
              : accuracy >= 50
              ? 'Good effort!'
              : 'Keep practicing!'}
          </Text>
          <Text style={styles.resultScore}>
            {correct} / {total}
          </Text>
          <Text style={styles.resultAccuracy}>{accuracy}% accuracy</Text>
          {skipped > 0 && (
            <Text style={styles.resultSkipped}>
              {skipped} word{skipped > 1 ? 's' : ''} skipped — added to review
              queue
            </Text>
          )}
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
  const inputColor = state.isSkipped
    ? colors.textMuted
    : !state.isAnswered && state.isCorrect === null
    ? colors.accent
    : state.isCorrect
    ? colors.success
    : colors.error;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.headerBack}>
            <Text style={styles.headerBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Spelling</Text>
          <Text style={styles.headerCount}>
            {state.correctCount}/{state.totalWords}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Question */}
          <View style={styles.questionContainer}>
            <Text style={styles.questionLabel}>Type the Norwegian word</Text>
            <Text style={styles.questionTranslation}>
              {question.translation}
            </Text>
          </View>

          {/* Hint */}
          {state.showHint && <Text style={styles.hint}>{question.hint}</Text>}

          {/* Skipped — show correct answer */}
          {state.isSkipped ? (
            <View style={styles.skippedContainer}>
              <Text style={styles.skippedLabel}>Correct answer</Text>
              <Text style={styles.skippedWord}>{question.word}</Text>
              <Text style={styles.skippedNote}>
                This word will appear more frequently in future sessions.
              </Text>
            </View>
          ) : (
            <>
              {/* Input */}
              <TextInput
                ref={inputRef}
                style={[styles.input, { borderColor: inputColor }]}
                value={state.input}
                onChangeText={setInput}
                onSubmitEditing={submit}
                editable={!state.isAnswered}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                placeholder="Type here..."
                placeholderTextColor={colors.textMuted}
              />

              {/* Wrong answer feedback */}
              {state.isCorrect === false && (
                <View style={styles.feedbackWrong}>
                  <Text style={styles.feedbackWrongText}>
                    {state.isRevealed
                      ? '✗ Not quite — the correct spelling is below'
                      : '✗ Not quite, try again'}
                  </Text>
                </View>
              )}

              {/* Correct feedback — a near-miss says so rather than claiming a
                  clean success, and always shows the correct form. */}
              {state.isAnswered && state.isCorrect && (
                <View
                  style={
                    state.wasTypo ? styles.feedbackWrong : styles.feedbackCorrect
                  }
                >
                  <Text
                    style={
                      state.wasTypo
                        ? styles.feedbackWrongText
                        : styles.feedbackCorrectText
                    }
                  >
                    {state.wasTypo ? '≈ Almost — small typo' : '✓ Correct!'}
                  </Text>
                  <Text style={styles.feedbackCorrectSub}>
                    Next word in 0.8s...
                  </Text>
                </View>
              )}

              {/* The correct spelling, once revealed. Without this a word you
                  cannot guess was a dead end until skip appeared. */}
              {state.isRevealed && (
                <View style={styles.revealContainer}>
                  <Text style={styles.revealLabel}>Correct spelling</Text>
                  <Text style={styles.revealWord}>{question.word}</Text>
                </View>
              )}
            </>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {/* Skip button — appears after N mistakes */}
            {state.showSkip && !state.isAnswered && !state.isSkipped && (
              <TouchableOpacity style={styles.skipBtn} onPress={skip}>
                <Text style={styles.skipBtnText}>Skip this word</Text>
              </TouchableOpacity>
            )}

            {/* Submit / Next */}
            {!state.isAnswered && !state.isSkipped && (
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  state.input.trim() === '' && styles.submitBtnDisabled,
                ]}
                onPress={submit}
                disabled={state.input.trim() === ''}
              >
                <Text style={styles.submitBtnText}>
                  {state.isCorrect === false ? 'Try again' : 'Check'}
                </Text>
              </TouchableOpacity>
            )}

            {(state.isCorrect === false || state.isSkipped) && (
              <TouchableOpacity style={styles.nextBtn} onPress={next}>
                <Text style={styles.nextBtnText}>
                  {state.currentIndex + 1 >= state.questions.length
                    ? 'See results'
                    : 'Next →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Expose constant for component use

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
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
    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    questionContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    questionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    questionTranslation: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    hint: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textMuted,
      textAlign: 'center',
      letterSpacing: 4,
      marginBottom: 24,
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      borderWidth: 2,
      textAlign: 'center',
      marginBottom: 12,
    },
    feedbackWrong: {
      backgroundColor: 'rgba(255, 59, 48, 0.10)',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 12,
      alignItems: 'center',
    },
    feedbackWrongText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.error,
    },
    feedbackCorrect: {
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 12,
      alignItems: 'center',
    },
    feedbackCorrectText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.success,
    },
    skippedContainer: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.border,
    },
    skippedLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    skippedWord: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    skippedNote: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
    revealContainer: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    revealLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    revealWord: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    actions: {
      marginTop: 8,
    },
    skipBtn: {
      borderWidth: 2,
      borderColor: colors.error,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 10,
    },
    skipBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.error,
    },
    submitBtn: {
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
    submitBtnDisabled: {
      backgroundColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    submitBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
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
    feedbackCorrectSub: {
      fontSize: 12,
      color: colors.success,
      marginTop: 4,
      opacity: 0.7,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 24,
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
      marginBottom: 8,
    },
    resultSkipped: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 20,
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
