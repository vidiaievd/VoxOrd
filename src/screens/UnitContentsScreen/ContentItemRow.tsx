import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { radii } from '../../theme/spacing';
import { Icon } from '../../components/ui/Icon';
import { Spinner } from '../../components/ui/Spinner';
import { Tag, type TagVariant } from '../../components/ui/Tag';
import type { UnitContentsItem } from '../../api/types';
import { contentIcon } from './contentIcon';

interface ContentItemRowProps {
  item: UnitContentsItem;
  /** Opens the item; a locked item never calls it. */
  onPress?: () => void;
  /** Tap on a locked row: the screen says why with a toast. */
  onLockedPress?: () => void;
  /** The material is being fetched for the phone (spinner), or could not be (crossed cloud). */
  download?: 'fetching' | 'failed';
}

const TAG_BY_STATUS: Record<UnitContentsItem['status'], TagVariant> = {
  completed: 'neutral',
  submitted: 'neutral',
  in_progress: 'accent',
  available: 'outline',
  locked: 'neutral',
};

/** «Text · 5 min», «Rule · mastery 40%» — the kind and what the payload knows about it. */
function useMeta(item: UnitContentsItem): string {
  const { t } = useTranslation();
  const minutes = item.durationMinutes;
  const withMinutes = (kind: string) =>
    minutes === null ? kind : `${kind} · ${t('unitContents.duration', { minutes })}`;
  switch (item.contentType) {
    case 'lesson':
      return withMinutes(
        item.lessonKind === 'audio' ? t('unitContents.kindAudio') : t('unitContents.kindText'),
      );
    case 'vocabulary_list':
      return t('unitContents.kindWords');
    case 'grammar_rule':
      return item.masteryPercent === null
        ? t('unitContents.kindRule')
        : t('unitContents.metaRule', { percent: item.masteryPercent });
    case 'exercise':
      return withMinutes(t('unitContents.kindExercise'));
    default:
      return '';
  }
}

export function ContentItemRow({ item, onPress, onLockedPress, download }: ContentItemRowProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const locked = item.status === 'locked';
  const active = item.status === 'in_progress';
  const meta = useMeta(item);

  const statusLabel = {
    completed: t('unitContents.statusCompleted'),
    submitted: t('unitContents.statusSubmitted'),
    in_progress: t('unitContents.statusInProgress'),
    available: t('unitContents.statusAvailable'),
    locked: t('unitContents.statusLocked'),
  }[item.status];
  const title = item.title ?? t('unitContents.untitled');
  const handler = locked ? onLockedPress : onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${statusLabel}`}
      accessibilityState={{ disabled: locked && !onLockedPress }}
      disabled={!handler}
      onPress={handler}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: radii.plate,
        borderWidth: 1,
        borderColor: active ? colors.accent700 : 'transparent',
        backgroundColor: pressed ? colors.neutral900 : colors.surface,
        opacity: locked ? 0.6 : 1,
      })}
    >
      <Icon name={contentIcon(item)} size={20} color={colors.neutral300} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {meta !== '' && (
          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      {download === 'fetching' && <Spinner size={16} color={colors.neutral400} />}
      {download === 'failed' && <Icon name="CloudSlash" size={16} color={colors.neutral500} />}
      <Tag label={statusLabel} variant={TAG_BY_STATUS[item.status]} />
    </Pressable>
  );
}
