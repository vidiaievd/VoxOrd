import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import { buildWritingTaskAnswer, countWords, writingTaskCanSubmit, type WritingTaskContent } from './templates/writingTask';

/**
 * `writing_task` body. Longer free-form text (essay / reader letter),
 * optionally choosing one of several topics first. Server-side "free-form"
 * (exercise-engine's FREE_FORM_CODES): always comes back `requiresReview:
 * true`, never auto-scored — FeedbackBar's generic "submitted for review"
 * tone covers it, same as TranslateBody.
 */
export function WritingTaskBody({ display, disabled, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as WritingTaskContent;
  const topics = content.options ?? [];
  const [topicId, setTopicId] = useState<string | null>(topics.length === 1 ? topics[0].id : null);
  const [text, setText] = useState('');

  useEffect(() => {
    onAnswerChange(buildWritingTaskAnswer(text, topicId), writingTaskCanSubmit(text, topics.length > 0, topicId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, topicId]);

  const selectedTopic = topics.find((topic) => topic.id === topicId) ?? null;
  const wordCount = countWords(text);

  return (
    <View>
      <Text style={styles.prompt}>{content.prompt}</Text>
      {content.instructions ? <Text style={styles.instructions}>{content.instructions}</Text> : null}

      {topics.length > 0 ? (
        <View style={styles.topics}>
          {topics.map((topic) => {
            const selected = topic.id === topicId;
            return (
              <Pressable
                key={topic.id}
                onPress={() => !disabled && setTopicId(topic.id)}
                disabled={disabled}
                style={[styles.topicChip, selected && styles.topicChipSelected]}
              >
                <Text style={[styles.topicChipText, selected && styles.topicChipTextSelected]}>{topic.title}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {selectedTopic?.body ? <Text style={styles.topicBody}>{selectedTopic.body}</Text> : null}

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
        autoCapitalize="sentences"
        placeholder={t('exerciseRunner.writingTaskPlaceholder')}
        placeholderTextColor={colors.textMuted}
      />
      {content.min_words || content.max_words ? (
        <Text style={styles.wordCount}>
          {t('exerciseRunner.writingTaskWordCount', {
            count: wordCount,
            min: content.min_words ?? 0,
            max: content.max_words ?? 0,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    prompt: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      lineHeight: 26,
    },
    instructions: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 16,
      lineHeight: 18,
    },
    topics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    topicChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.backgroundInput,
    },
    topicChipSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    topicChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    topicChipTextSelected: {
      color: colors.backgroundInput,
    },
    topicBody: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 20,
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
      minHeight: 160,
      textAlignVertical: 'top',
    },
    wordCount: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 8,
      textAlign: 'right',
    },
  });
