import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getDueCards } from '../../../api/srs';
import { Button, Icon, PressableScale } from '../../../components/ui';
import type { DueCount } from '../../../hooks/useDueCount';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { ReviewSkeleton } from './Skeleton';

interface ReviewProps {
  due: DueCount;
  onOpenPractice: () => void;
  onStart: () => void;
}

/** A card takes about this long; the server gives no estimate (Home spec §6.2, block 5). */
const SECONDS_PER_CARD = 20;
/** The breakdown reads the queue itself; the server caps a page here, so past it there is none. */
const BREAKDOWN_MAX = 100;

interface Split {
  words: number;
  exercises: number;
}

/** Words and exercises among the cards due, or null while unknown or when too many to read. */
function useSplit(due: DueCount): Split | null {
  const [split, setSplit] = useState<Split | null>(null);
  const count = due.count;
  const worth = count !== null && count > 0 && count <= BREAKDOWN_MAX && !due.fromReplica;
  useEffect(() => {
    if (!worth) {
      setSplit(null);
      return;
    }
    let live = true;
    getDueCards({ limit: BREAKDOWN_MAX })
      .then((env) => {
        if (!live) return;
        const words = env.cards.filter((c) => c.contentType === 'VOCABULARY_WORD').length;
        setSplit({ words, exercises: env.cards.length - words });
      })
      .catch(() => live && setSplit(null));
    return () => {
      live = false;
    };
  }, [worth, count]);
  return split;
}

/** Block 5: what is due, and the way in. With nothing due it says so and offers no button. */
export function Review({ due, onOpenPractice, onStart }: ReviewProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const split = useSplit(due);

  if (due.status === 'loading') return <ReviewSkeleton />;

  const frame = {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.cardPadding,
  };

  // No number to show: say what to do, never that something broke (the web's rule).
  if (due.count === null) {
    return (
      <PressableScale
        accessibilityRole="button"
        onPress={onOpenPractice}
        style={{ ...frame, gap: 4 }}
      >
        <Text style={[typography.overline, { color: colors.neutral400 }]}>
          {t('today.reviewTitle')}
        </Text>
        <Text style={[typography.body, { color: colors.neutral400 }]}>
          {t('today.reviewUnavailableHint')}
        </Text>
      </PressableScale>
    );
  }

  if (due.count === 0) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('today.reviewNone')}
        onPress={onOpenPractice}
        style={{ ...frame, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Icon name="CheckCircle" size={28} color={colors.accentBase} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>
            {t('today.reviewNone')}
          </Text>
          {due.reviewedToday ? (
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {t('today.reviewedToday', { count: due.reviewedToday })}
            </Text>
          ) : null}
        </View>
      </PressableScale>
    );
  }

  const minutes = Math.ceil((due.count * SECONDS_PER_CARD) / 60);
  const caption = due.fromReplica
    ? t('today.reviewOffline')
    : split
      ? t('today.reviewSplit', { words: split.words, exercises: split.exercises })
      : null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${t('today.reviewTitle')}: ${due.count} ${t('today.reviewDueNow', { min: minutes })}`}
      onPress={onOpenPractice}
      style={{ ...frame, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="Repeat" size={18} color={colors.neutral400} />
        <Text style={[typography.overline, { color: colors.neutral400 }]}>
          {t('today.reviewTitle')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={[typography.bigNumber, { color: colors.text }]}>{due.count}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.body, { color: colors.text }]}>
            {t('today.reviewDueNow', { min: minutes })}
          </Text>
          {caption ? (
            <Text style={[typography.meta, { color: colors.neutral500 }]}>{caption}</Text>
          ) : null}
        </View>
        <Button variant="secondary" size={44} label={t('today.reviewStartShort')} onPress={onStart} />
      </View>
    </PressableScale>
  );
}
