import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AssistContext } from '../../../api/assistant';
import { classStart, type NextClass as NextClassData } from '../../../api/nextClass';
import { useAssistantAvailability } from '../../../hooks/useAssistantAvailability';
import { useTranslation } from '../../../i18n';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { classRelative } from '../blockLogic';
import { WEEKDAY_KEYS } from '../dayLine';

interface NextClassProps {
  nextClass: NextClassData | null;
  /**
   * Variant C: «Prepare with the assistant» — drawn only when the server says the assistant
   * answers about that class.
   */
  offerAssist?: boolean;
  onNavigate?: (screen: Screen) => void;
}

/** «30.10 · 18:00» — the class as the assistant's context chip names it. */
export function classLabel(nextClass: Pick<NextClassData, 'date' | 'startTime'>): string {
  const [, month, day] = nextClass.date.split('-');
  return `${day}.${month} · ${nextClass.startTime}`;
}

/**
 * Block 7: the soonest class within two weeks. No empty card — on the phone an empty slot
 * spends the first screen. Not pressable: there is no school screen on the phone — only its
 * assistant link is.
 */
export function NextClass({ nextClass, offerAssist = false, onNavigate }: NextClassProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const lessonId = nextClass?.lessonId ?? null;
  const assistContext: AssistContext | null = useMemo(
    () => (offerAssist && onNavigate && lessonId ? { kind: 'class', lessonId } : null),
    [offerAssist, onNavigate, lessonId],
  );
  const assist = useAssistantAvailability(assistContext);
  if (!nextClass) return null;

  const start = classStart(nextClass);
  const relative = classRelative(start, new Date(), t);
  const time = `${nextClass.startTime}–${nextClass.endTime}`;
  const line = [time, nextClass.groupName].filter(Boolean).join(' · ');
  const where = [
    nextClass.schoolName,
    nextClass.room ? t('today.nextClass.room', { room: nextClass.room }) : null,
    nextClass.teacher?.name ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  const prepare =
    assistContext && assist.available && onNavigate ? (
      <Pressable
        accessibilityRole="link"
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={() =>
          onNavigate({
            name: 'Assistant',
            context: assistContext,
            contextLabel: classLabel(nextClass),
            returnTo: { name: 'Today' },
          })
        }
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      >
        <Text style={[typography.secondary, { color: colors.accent300 }]}>{t('today.nextClass.prepare')}</Text>
      </Pressable>
    ) : null;

  return (
    <View
      // With a link inside, the card cannot be one element for screen readers.
      accessible={!prepare}
      accessibilityLabel={[`${t('today.nextClass.title')} ${relative}`, line, where].join('. ')}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        padding: spacing.cardPadding,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <View
        style={{
          width: 48,
          height: 56,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.neutral700,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.overline, { color: colors.neutral400, fontSize: 10 }]}>
          {t(`today.weekdayShort.${WEEKDAY_KEYS[start.getDay()]}`)}
        </Text>
        <Text style={[typography.cardTitle, { color: colors.text, fontSize: 20, lineHeight: 24 }]}>
          {start.getDate()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.overline, { color: colors.neutral400 }]} numberOfLines={1}>
          {`${t('today.nextClass.title')} · ${relative}`}
        </Text>
        <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={1}>
          {line}
        </Text>
        {where ? (
          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={2}>
            {where}
          </Text>
        ) : null}
        {prepare}
      </View>
    </View>
  );
}
