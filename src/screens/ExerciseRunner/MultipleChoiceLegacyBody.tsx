import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import { buildMcqAnswer, extractCorrectOptionIds, mcqCanSubmit, type McqContent } from './templates/multipleChoice';

/**
 * `multiple_choice` in the pre-plan-53 form: one question, one submission.
 *
 * Untouched by the rewrite, deliberately. 121 exercises are still written this way (plan
 * 53 §8 Q2 reseeds only the first lesson of `norsk-b1`), the engine still grades them
 * with `multiple-choice-legacy.ts`, and this is what they have always looked like on the
 * phone. `MultipleChoiceBody` decides which of the two runs, by the shape of the document
 * — exactly as the server does.
 *
 * Option-card visual language adapted from QuizExercise.tsx (rounded card, colored border
 * + ✓/✗ icon on feedback) — visual reuse only, the data model and grading are entirely
 * different (server-graded here, see src/api/exercises.ts).
 */
export function MultipleChoiceLegacyBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as McqContent;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    onAnswerChange(buildMcqAnswer(selectedId), mcqCanSubmit(selectedId));
    // Only the selection should re-trigger this — onAnswerChange is stable
    // per render from the parent (useCallback), but including it in deps
    // would refire on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const showFeedback = disabled && verdict !== null;
  const correctIds = showFeedback ? extractCorrectOptionIds(verdict!.feedback.correctAnswer) : null;

  const cardStyleFor = (optionId: string) => {
    if (!showFeedback) {
      return optionId === selectedId ? styles.optionSelected : styles.option;
    }
    if (verdict!.correct) {
      return optionId === selectedId ? styles.optionCorrect : styles.optionDimmed;
    }
    if (correctIds?.includes(optionId)) return styles.optionCorrect;
    if (optionId === selectedId) return styles.optionWrong;
    return styles.optionDimmed;
  };

  const isMarkedCorrect = (optionId: string) =>
    showFeedback && (verdict!.correct ? optionId === selectedId : correctIds?.includes(optionId));
  const isMarkedWrong = (optionId: string) =>
    showFeedback && !verdict!.correct && optionId === selectedId && !correctIds?.includes(optionId);

  return (
    <View>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}
      <Text style={styles.question}>{content.question}</Text>
      <View style={styles.options}>
        {content.options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={cardStyleFor(option.id)}
            onPress={() => setSelectedId(option.id)}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <Text style={styles.optionText}>{option.text}</Text>
            {isMarkedCorrect(option.id) && <Text style={styles.optionIcon}>✓</Text>}
            {isMarkedWrong(option.id) && <Text style={styles.optionIcon}>✗</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    context: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 10,
      lineHeight: 18,
    },
    question: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 20,
    },
    options: {},
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionSelected: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.accentLight,
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    optionCorrect: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.success,
    },
    optionWrong: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255, 59, 48, 0.10)',
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.danger,
    },
    optionDimmed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: 'transparent',
      opacity: 0.5,
    },
    optionText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    optionIcon: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
