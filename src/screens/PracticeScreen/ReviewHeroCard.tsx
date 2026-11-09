import React from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Overline, ProgressTrack, Skeleton } from '../../components/ui';
import type { DueCount } from '../../hooks/useDueCount';
import { useTranslation } from '../../i18n';
import {
  estimateMinutes,
  forecastLine,
  sourceBreakdown,
  type ForecastDay,
  type SourceCounts,
} from '../../lib/practice';
import { useTheme } from '../../providers/ThemeProvider';

const WEEKDAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface ReviewHeroCardProps {
  /** The one due number of the app (decision D3) — the badge shows the same. */
  due: DueCount;
  /** Today's cap, from the queue overview; 0 or unknown hides the quota. */
  dailyLimit: number;
  reviewedToday: number;
  sources: SourceCounts;
  forecast: readonly ForecastDay[] | null;
  /** The queue behind the button failed to load — only the hero's own error state. */
  onStart: () => void;
  onRetry: () => void;
  now?: Date;
}

/**
 * The «Review» card at the top of Practice (Practice §6.2): the count, where it comes from,
 * today's progress and the way in. A met quota still offers the button — the session's first
 * screen explains it (6b). With nothing due there is no button, only what comes next.
 */
export function ReviewHeroCard({
  due,
  dailyLimit,
  reviewedToday,
  sources,
  forecast,
  onStart,
  onRetry,
  now = new Date(),
}: ReviewHeroCardProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();

  if (due.status === 'loading') {
    return (
      <Card variant="lit" padding={18} style={{ gap: 14 }}>
        <Skeleton width={90} height={12} />
        <Skeleton width={110} height={44} />
        <Skeleton height={48} radius={8} />
      </Card>
    );
  }

  if (due.count === null) {
    return (
      <Card variant="lit" padding={18} style={{ gap: 12 }}>
        <Overline style={{ color: colors.accent300 }}>{t('practice.reviewKicker')}</Overline>
        <Text style={[typography.body, { color: colors.neutral400 }]}>
          {t('practice.loadError')}
        </Text>
        <Button variant="secondary" label={t('courses.retry')} onPress={onRetry} />
      </Card>
    );
  }

  const count = due.count;
  const parts = sourceBreakdown(sources).map(p =>
    t(
      {
        courseWords: 'practice.srcCourseWords',
        myWords: 'practice.srcMyWords',
        rules: 'practice.srcRules',
        exercises: 'practice.srcExercises',
      }[p.key],
      { count: p.count },
    ),
  );
  const forecastParts = forecastLine(forecast, now).map(p =>
    p.when === 'tomorrow'
      ? t('practice.forecastTomorrow', { count: p.count })
      : t('practice.forecastWeekday', {
          weekday: t(`practice.weekdayIn.${WEEKDAY_KEY[p.weekday]}`),
          count: p.count,
        }),
  );
  const forecastText =
    forecastParts.length === 2
      ? t('practice.forecast', { first: forecastParts[0], second: forecastParts[1] })
      : forecastParts.length === 1
        ? t('practice.forecastOne', { first: forecastParts[0] })
        : null;
  const hasQuota = dailyLimit > 0;

  return (
    <Card variant="lit" padding={18} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Overline style={{ color: colors.accent300 }}>{t('practice.reviewKicker')}</Overline>
        {hasQuota ? (
          <Text style={[typography.meta, { color: colors.neutral400 }]}>
            {t('practice.todayOf', { done: reviewedToday, limit: dailyLimit })}
          </Text>
        ) : null}
      </View>

      <View
        accessible
        accessibilityLabel={`${count} ${t('practice.dueNow')}`}
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}
      >
        <Text
          style={{
            fontSize: 44,
            lineHeight: 44,
            fontWeight: '500',
            color: colors.text,
          }}
        >
          {count}
        </Text>
        <Text style={[typography.body, { color: colors.neutral400 }]}>
          {t('practice.dueNow')}
        </Text>
      </View>

      {parts.length > 0 ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {parts.join(' · ')}
        </Text>
      ) : null}

      {hasQuota ? <ProgressTrack value={reviewedToday / dailyLimit} /> : null}

      {count > 0 ? (
        <Button
          block
          icon="Play"
          label={t('practice.reviewCta', { min: estimateMinutes(count) })}
          onPress={onStart}
        />
      ) : (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('practice.queueEmpty')}
        </Text>
      )}

      {forecastText ? (
        <Text style={[typography.meta, { color: colors.neutral500 }]}>{forecastText}</Text>
      ) : null}
    </Card>
  );
}
