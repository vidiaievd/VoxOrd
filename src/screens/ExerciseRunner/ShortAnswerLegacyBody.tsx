import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildShortAnswerAnswer,
  extractReferenceAnswer,
  shortAnswerCanSubmit,
  type ShortAnswerLegacyContent,
} from './templates/shortAnswer';

/**
 * The old `short_answer` body, moved here whole and unchanged by plan 51 phase 7.
 *
 * One question, one free-text answer, one submission. It CAN auto-score (exact match
 * against `accepted_answers`) but otherwise routes to review rather than ever showing a
 * flat "incorrect" — FeedbackBar already distinguishes correct/review tones, so this body
 * only adds the model reference answer when the server reveals one (PRACTICE mode).
 *
 * It is still live and still correct for the 144 exercises written this way (plan 51 §8
 * Q1); the engine grades them with `short-answer-legacy.ts`, exactly as before. Which of
 * the two bodies runs is decided by the shape of the document, in `ShortAnswerBody` —
 * never by the template code, which is the same for both.
 */
export function ShortAnswerLegacyBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as ShortAnswerLegacyContent;
  const [text, setText] = useState('');

  useEffect(() => {
    onAnswerChange(buildShortAnswerAnswer(text), shortAnswerCanSubmit(text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const showFeedback = disabled && verdict !== null;
  const referenceAnswer = showFeedback ? extractReferenceAnswer(verdict!.feedback.correctAnswer) : null;

  return (
    <View>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}
      <Text style={styles.question}>{content.question}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
        autoCapitalize="sentences"
        maxLength={content.max_length}
        placeholder={t('exerciseRunner.shortAnswerPlaceholder')}
        placeholderTextColor={colors.textMuted}
      />
      {showFeedback && referenceAnswer && !verdict!.correct ? (
        <Text style={styles.reference}>
          {t('exerciseRunner.modelAnswer')}: <Text style={styles.referenceValue}>{referenceAnswer}</Text>
        </Text>
      ) : null}
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
      lineHeight: 26,
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.textPrimary,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    reference: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 12,
    },
    referenceValue: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
