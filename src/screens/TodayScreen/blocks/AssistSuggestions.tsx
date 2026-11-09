import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AssistContext } from '../../../api/assistant';
import { latestDirectReview } from '../../../api/submissions';
import type { CourseHomePayload } from '../../../api/types';
import { PressableScale } from '../../../components/ui';
import { useAssistantAvailability } from '../../../hooks/useAssistantAvailability';
import { useMasteryProfile } from '../../../hooks/useMasteryProfile';
import { useMySubmissions } from '../../../hooks/useMySubmissions';
import { useSwrResource } from '../../../hooks/useSwrResource';
import { useTranslation } from '../../../i18n';
import { courseHomeResource } from '../../../lib/courseResources';
import { splitVerdicts } from '../../../lib/splitVerdicts';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { workOnThisTopics } from '../blockLogic';
import { useRegisterRefresh } from '../refresh';
import { nextUnit } from '../today';

interface AssistSuggestionsProps {
  /** The course «Continue» leads into; null without one. */
  courseId: string | null;
  onNavigate: (screen: Screen) => void;
}

/** One prompt the card offers: what it says, and the context it is asked in. */
export interface Suggestion {
  key: string;
  prompt: string;
  context: AssistContext;
  /** What the thread's context chip reads. */
  contextLabel?: string;
}

const FREE: AssistContext = { kind: 'free' };
const noCourse = (): Promise<CourseHomePayload> => Promise.reject(new Error('no course'));

/**
 * Block D2 (D): «Ask the assistant» with up to three prompts made on the phone — the unit
 * «Continue» leads into, the weakest topic of the profile, the last work a model reviewed.
 * The card is drawn when the assistant takes a free question; each prompt only when it takes
 * a question in that prompt's own context, since a course may be someone else's to pay for.
 */
export function AssistSuggestions({ courseId, onNavigate }: AssistSuggestionsProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const resource = useMemo(() => (courseId ? courseHomeResource(courseId) : null), [courseId]);
  const home = useSwrResource<CourseHomePayload>(resource?.key ?? null, resource?.load ?? noCourse);
  const { profile, refresh: refreshProfile } = useMasteryProfile();
  const { submissions } = useMySubmissions();
  useRegisterRefresh(refreshProfile);
  const free = useAssistantAvailability(FREE);

  const unit = home.data ? nextUnit(home.data.units) : null;
  const topic = profile ? (workOnThisTopics(splitVerdicts(profile.weakest).weak, t)[0] ?? null) : null;
  const work = submissions ? latestDirectReview(submissions.items) : null;

  const suggestions: Suggestion[] = [];
  if (courseId && unit) {
    suggestions.push({
      key: 'unit',
      prompt: t('today.suggest.unit', { unit: unit.title }),
      context: { kind: 'unit', courseId, unitId: unit.id },
      contextLabel: unit.title,
    });
  }
  if (topic) {
    suggestions.push({ key: 'topic', prompt: t('today.suggest.topic', { topic }), context: FREE });
  }
  if (work) {
    const title = work.title ?? t('submission.fallbackTitle');
    suggestions.push({
      key: 'work',
      prompt: t('today.suggest.work', { title }),
      context: { kind: 'submission', attemptId: work.attemptId, exerciseId: work.exerciseId },
      contextLabel: title,
    });
  }

  if (!free.available) return null;

  const open = (s?: Suggestion) =>
    onNavigate({
      name: 'Assistant',
      context: s?.context ?? FREE,
      ...(s?.contextLabel ? { contextLabel: s.contextLabel } : {}),
      ...(s ? { prompt: s.prompt } : {}),
      returnTo: { name: 'Today' },
    });

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('today.suggest.title')}
      onPress={() => open()}
      style={{
        borderWidth: 1,
        borderColor: colors.neutral800,
        borderRadius: radii.card,
        padding: spacing.cardPadding,
        gap: 10,
      }}
    >
      <Text style={[typography.cardTitle, { color: colors.text }]}>{t('today.suggest.title')}</Text>
      {suggestions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <SuggestionChip key={s.key} suggestion={s} onPress={() => open(s)} />
          ))}
        </View>
      ) : null}
    </PressableScale>
  );
}

/** A prompt as a neutral tag — drawn once the server takes a question in its context. */
function SuggestionChip({ suggestion, onPress }: { suggestion: Suggestion; onPress: () => void }) {
  const { colors, typography } = useTheme();
  const { available } = useAssistantAvailability(suggestion.context);
  if (!available) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.tag,
        backgroundColor: pressed ? colors.neutral800 : colors.neutral900,
        maxWidth: '100%',
      })}
    >
      <Text style={[typography.secondary, { color: colors.neutral300 }]} numberOfLines={2}>
        {suggestion.prompt}
      </Text>
    </Pressable>
  );
}
