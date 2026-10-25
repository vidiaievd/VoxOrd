import React from 'react';
import { Text, View } from 'react-native';
import type { AssignmentContentType } from '../../../api/assignments';
import { Card, Icon, Tag } from '../../../components/ui';
import { useNextAssignment } from '../../../hooks/useNextAssignment';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { useRegisterRefresh } from '../refresh';

/** The kind of material, as `itemType` names it; a whole course has no such label. */
const TYPE_KEY: Record<AssignmentContentType, string | null> = {
  LESSON: 'itemType.lesson',
  VOCABULARY_LIST: 'itemType.vocabulary_list',
  GRAMMAR_RULE: 'itemType.grammar_rule',
  EXERCISE: 'itemType.exercise',
  CONTAINER: null,
};

/**
 * Block 8 (variant C; A only behind `HOME_SHOW_ASSIGNMENT`): the teacher's assignment due
 * soonest. The spec's «Работу проверит преподаватель» is left out — not every assignment goes
 * to a reviewer, and the list does not say which do.
 */
export function Assignment() {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const { assignment, refresh } = useNextAssignment(true);
  useRegisterRefresh(refresh);
  if (!assignment) return null;

  let due = assignment.dueAt.slice(0, 10);
  try {
    due = new Date(assignment.dueAt).toLocaleDateString(language, { day: 'numeric', month: 'short' });
  } catch {
    // The ISO day is still true.
  }
  const typeKey = TYPE_KEY[assignment.contentType];
  const detail = [typeKey ? t(typeKey) : null, assignment.notes].filter(Boolean).join('. ');

  return (
    <Card variant="outline" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="ClipboardText" size={18} color={colors.neutral400} />
        <Text style={[typography.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={2}>
          {t('today.assignment.title', { title: assignment.title })}
        </Text>
        <Tag label={t('today.assignment.due', { date: due })} variant="outline" />
      </View>
      {detail ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
    </Card>
  );
}
