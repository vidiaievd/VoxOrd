import React, { useMemo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { AssistContext } from '../../../api/assistant';
import type { CourseHomePayload } from '../../../api/types';
import { Icon } from '../../../components/ui';
import { useAssistantAvailability } from '../../../hooks/useAssistantAvailability';
import { useSwrResource } from '../../../hooks/useSwrResource';
import { useTranslation } from '../../../i18n';
import { courseHomeResource } from '../../../lib/courseResources';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { nextUnit } from '../today';

interface AssistInlineProps {
  /** The course «Continue» leads into; null without one. */
  courseId: string | null;
  onNavigate: (screen: Screen) => void;
}

const noCourse = (): Promise<CourseHomePayload> => Promise.reject(new Error('no course'));

/**
 * Block 2 (C): the assistant's line in the flow — about the unit «Continue» leads into, or a
 * free question without one. Drawn only when the server says the assistant answers in that
 * context: a school's course is the school's to pay for, so the learner's own plan cannot
 * answer it (plan 03 step 3).
 */
export function AssistInline({ courseId, onNavigate }: AssistInlineProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const resource = useMemo(() => (courseId ? courseHomeResource(courseId) : null), [courseId]);
  // The same cache entry «Continue» reads: no request of its own.
  const home = useSwrResource<CourseHomePayload>(resource?.key ?? null, resource?.load ?? noCourse);
  const unit = home.data ? nextUnit(home.data.units) : null;

  // While the course is still loading the line waits, rather than offering a free question
  // and turning into a unit's a moment later.
  const settling = courseId !== null && !home.data && home.status === 'loading';
  const unitId = unit?.id ?? null;
  const context: AssistContext | null = useMemo(() => {
    if (settling) return null;
    return courseId && unitId ? { kind: 'unit', courseId, unitId } : { kind: 'free' };
  }, [courseId, settling, unitId]);
  const { available } = useAssistantAvailability(context);
  if (!context || !available) return null;

  const open = (startVoice: boolean) =>
    onNavigate({
      name: 'Assistant',
      context,
      ...(unit ? { contextLabel: unit.title } : {}),
      ...(startVoice ? { startVoice } : {}),
      returnTo: { name: 'Today' },
    });
  const label = unit ? t('today.assist.ask', { unit: unit.title }) : t('today.assist.askPlain');

  return (
    <View
      style={{
        height: 48,
        flexShrink: 0,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.accent700,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        // The one glow Nocturne allows; Android keeps to the edge (Home §6.2, block 2).
        ...(Platform.OS === 'ios'
          ? { shadowColor: colors.accentBase, shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } }
          : {}),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => open(false)}
        style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16 }}
      >
        <Icon name="Sparkle" size={18} color={colors.accent300} />
        <Text
          style={[typography.body, { color: colors.neutral400, flex: 1 }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('today.assist.voice')}
        onPress={() => open(true)}
        hitSlop={6}
        style={{ width: 36, height: 36, borderRadius: 18, marginRight: 6, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="Microphone" size={18} color={colors.neutral300} />
      </Pressable>
    </View>
  );
}
