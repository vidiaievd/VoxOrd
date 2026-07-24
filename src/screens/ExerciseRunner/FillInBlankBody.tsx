import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  blankIdsFromSegments,
  buildFillInBlankAnswer,
  extractExpectedBlankAnswers,
  fillInBlankCanSubmit,
  parseTextWithBlanks,
  type FillInBlankContent,
} from './templates/fillInBlank';

/**
 * `fill_in_blank` body. Input styling (rounded box, colored border by
 * correctness) adapted from SpellingExercise.tsx — visual reuse only; here
 * there can be multiple blanks per item and grading is server-side.
 *
 * There's no per-blank correctness in the submit response (only the
 * item-level `correct` flag — see src/api/exercises.ts), so feedback colors
 * every blank the same way and shows the expected word underneath each one
 * when the item as a whole was wrong.
 */
export function FillInBlankBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as FillInBlankContent;

  const segments = useMemo(() => parseTextWithBlanks(content.text_with_blanks), [content.text_with_blanks]);
  const blankIds = useMemo(() => blankIdsFromSegments(segments), [segments]);

  const [values, setValues] = useState<Record<number, string>>({});
  const [activeBlankId, setActiveBlankId] = useState<number | null>(blankIds[0] ?? null);

  useEffect(() => {
    onAnswerChange(buildFillInBlankAnswer(values, blankIds), fillInBlankCanSubmit(values, blankIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, blankIds]);

  const showFeedback = disabled && verdict !== null;
  const expected = showFeedback ? extractExpectedBlankAnswers(verdict!.feedback.correctAnswer) : null;
  const borderColor = !showFeedback
    ? colors.accent
    : verdict!.correct
      ? colors.success
      : colors.danger;

  const setBlankValue = (id: number, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleWordBankPress = (word: string) => {
    // Fill the currently focused blank, or the first still-empty one.
    const target =
      activeBlankId ?? blankIds.find((id) => (values[id] ?? '').trim() === '') ?? blankIds[0];
    if (target !== undefined) setBlankValue(target, word);
  };

  return (
    <View>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}

      <View style={styles.sentence}>
        {segments.map((segment, i) =>
          segment.type === 'text' ? (
            <Text key={i} style={styles.sentenceText}>
              {segment.value}
            </Text>
          ) : (
            <View key={i} style={styles.blankGroup}>
              <TextInput
                style={[styles.blankInput, { borderColor }]}
                value={values[segment.id] ?? ''}
                onChangeText={(v) => setBlankValue(segment.id, v)}
                onFocus={() => setActiveBlankId(segment.id)}
                editable={!disabled}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="…"
                placeholderTextColor={colors.textMuted}
              />
              {showFeedback && !verdict!.correct && expected?.[segment.id] ? (
                <Text style={styles.expectedText}>{expected[segment.id]}</Text>
              ) : null}
            </View>
          ),
        )}
      </View>

      {content.word_bank && content.word_bank.length > 0 && !disabled ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wordBank}>
          {content.word_bank.map((word) => (
            <TouchableOpacity
              key={word}
              style={styles.chip}
              onPress={() => handleWordBankPress(word)}
              activeOpacity={0.8}
            >
              <Text style={styles.chipText}>{word}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    context: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 14,
      lineHeight: 18,
    },
    sentence: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    sentenceText: {
      fontSize: 18,
      lineHeight: 30,
      color: colors.textPrimary,
    },
    blankGroup: {
      alignItems: 'center',
      marginVertical: 4,
    },
    blankInput: {
      minWidth: 84,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      borderWidth: 2,
      paddingHorizontal: 10,
      paddingVertical: 4,
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    expectedText: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    wordBank: {
      marginTop: 20,
    },
    chip: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
