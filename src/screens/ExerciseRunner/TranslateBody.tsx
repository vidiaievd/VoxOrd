import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import { buildTranslateAnswer, translateCanSubmit, type TranslateContent } from './templates/translate';

/**
 * Shared body for `translate_to_target` and `translate_from_target` — same
 * content/answer shape, only the direction label differs. Both route to human
 * review (`translate.validator.ts` in exercise-engine): they always
 * come back `requiresReview: true`, never auto-scored, so there's nothing
 * template-specific to highlight in feedback — FeedbackBar's generic
 * "submitted for review" tone covers it.
 */
export function TranslateBody({ display, disabled, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as TranslateContent;
  const [text, setText] = useState('');

  useEffect(() => {
    onAnswerChange(buildTranslateAnswer(text), translateCanSubmit(text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const directionLabel =
    display.templateCode === 'translate_to_target'
      ? t('exerciseRunner.translateToTargetLabel', { language: display.targetLanguage })
      : t('exerciseRunner.translateFromTargetLabel', { language: display.targetLanguage });

  return (
    <View>
      <Text style={styles.direction}>{directionLabel}</Text>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}
      <Text style={styles.sourceText}>{content.source_text}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
        autoCapitalize="sentences"
        placeholder={t('exerciseRunner.translatePlaceholder')}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    direction: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    context: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 10,
      lineHeight: 18,
    },
    sourceText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 20,
      lineHeight: 28,
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
  });
