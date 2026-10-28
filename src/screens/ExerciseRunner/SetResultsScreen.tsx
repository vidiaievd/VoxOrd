import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, IconName, PressableScale } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { Typography } from '../../theme/typography';
import { radii } from '../../theme/spacing';
import type { UnitContentsResult } from '../../api/types';
import type { Screen } from '../../navigation/screens';
import { useSwrResource } from '../../hooks/useSwrResource';
import { useUnitNumber } from '../../hooks/useUnitNumber';
import { unitContentsResource } from '../../lib/courseResources';
import { itemsInOrder, nextAfterSet } from '../../lib/nextItem';
import { openContentItem } from '../../lib/openContentItem';
import type { ItemResult } from './runnerMachine';
import { buildResultsSummary, formatSetTime } from './resultsSummary';

interface SetResultsScreenProps {
  results: ItemResult[];
  /** The set that was walked — «Next» names a material outside it. */
  exerciseIds: string[];
  unitId: string;
  courseId: string;
  /** Carried onto a «try again» runner, as the unit screen hands it to the first one. */
  sourceLessonId?: string;
  /** Open «Next» or a wrong exercise. */
  onOpen: (screen: Screen) => void;
  /** «To the unit». Returning remounts the unit screen, which refetches its contents. */
  onToUnit: () => void;
}

const titleKeyOf = (ratio: number) =>
  ratio >= 0.9 ? 'Excellent' : ratio >= 0.7 ? 'Good' : ratio >= 0.5 ? 'Okay' : 'KeepGoing';

/**
 * Results of a finished exercise set — Courses spec §8.6 (`5i`): kicker, a title by
 * `handledRatio`, the waiting line, one stat tile, outcome rows and «Next · {item}» / «To the
 * unit». No emoji, no coloured track. Work handed in for review is a completion, not a
 * mistake: it counts towards «counted» and the title, never against accuracy.
 *
 * The «added to review» row of the spec is not drawn: the verdict does not say what reached
 * the SRS, and the screen does not guess.
 */
export function SetResultsScreen({
  results,
  exerciseIds,
  unitId,
  courseId,
  sourceLessonId,
  onOpen,
  onToUnit,
}: SetResultsScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const summary = buildResultsSummary(results);
  const unitNumber = useUnitNumber(courseId, unitId);

  // Fetched fresh on mount (shown from cache meanwhile), so «Next» sees the set's new statuses.
  const resource = useMemo(() => unitContentsResource(unitId), [unitId]);
  const contents = useSwrResource<UnitContentsResult>(resource.key, resource.load).data;

  const titleOf = useMemo(() => {
    const titles = new Map<string, string>();
    if (contents) {
      for (const i of itemsInOrder(contents)) {
        if (i.contentType === 'exercise' && i.title) titles.set(i.contentId, i.title);
      }
    }
    return (id: string) => titles.get(id) ?? null;
  }, [contents]);

  const next = contents ? nextAfterSet(contents, exerciseIds) : null;
  const nextScreen =
    next && contents ? openContentItem(next, contents, { unitId, courseId }) : null;

  const retry = (exerciseId: string) =>
    onOpen({
      name: 'ExerciseRunner',
      exerciseIds: [exerciseId],
      startIndex: 0,
      unitId,
      courseId,
      ...(sourceLessonId === undefined ? {} : { sourceLessonId }),
    });

  const tone = titleKeyOf(summary.handledRatio);
  const lead =
    summary.waitingTeacher > 0 || summary.waitingAi > 0
      ? [
          summary.waitingTeacher > 0
            ? t('exerciseRunner.resultsWaiting', { count: summary.waitingTeacher })
            : null,
          summary.waitingAi > 0
            ? t('exerciseRunner.resultsWaitingAi', { count: summary.waitingAi })
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      : t(`exerciseRunner.results${tone}Message`);

  const reviewTitles = summary.reviewIds
    .map(titleOf)
    .filter((title): title is string => title !== null)
    .join(', ');

  const stats = [
    {
      value: `${Math.round(summary.accuracy * 100)}%`,
      label: t('exerciseRunner.statAccuracy'),
      color: colors.accent300,
    },
    {
      value: t('exerciseRunner.statCountedValue', {
        counted: summary.correct + summary.needsReview,
        total: summary.total,
      }),
      label: t('exerciseRunner.statCounted'),
      color: colors.text,
    },
    {
      value: formatSetTime(summary.totalTimeSpentSeconds),
      label: t('exerciseRunner.statTime'),
      color: colors.text,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={styles.kicker}>
            {unitNumber === null
              ? t('exerciseRunner.resultsKickerNoUnit')
              : t('exerciseRunner.resultsKicker', { n: unitNumber })}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {t(`exerciseRunner.results${tone}Title`)}
          </Text>
          <Text style={styles.lead}>{lead}</Text>
        </View>

        <View style={styles.tile}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.stat, i > 0 && styles.statDivided]}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View>
          <OutcomeRow
            styles={styles}
            icon="CheckCircle"
            label={t('exerciseRunner.outCorrect')}
            sub={t('exerciseRunner.outCorrectSub')}
            value={String(summary.correct)}
          />
          {summary.needsReview > 0 ? (
            <OutcomeRow
              styles={styles}
              icon="HourglassMedium"
              label={t('exerciseRunner.resultsNeedsReview')}
              sub={reviewTitles || null}
              value={String(summary.needsReview)}
            />
          ) : null}
          {summary.wrongIds.map(id => {
            const title = titleOf(id);
            return (
              <OutcomeRow
                key={id}
                styles={styles}
                icon="ArrowCounterClockwise"
                label={t('exerciseRunner.outWrong')}
                sub={
                  title === null
                    ? t('exerciseRunner.outRetryUntitled')
                    : t('exerciseRunner.outRetry', { title })
                }
                onPress={() => retry(id)}
              />
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {next && nextScreen ? (
          <>
            <Button
              block
              size={48}
              label={t('exerciseRunner.nextItem', { item: next.title ?? '' })}
              onPress={() => onOpen(nextScreen)}
            />
            <Button
              block
              size={44}
              variant="ghost"
              label={t('exerciseRunner.toUnit')}
              onPress={onToUnit}
            />
          </>
        ) : (
          <Button block size={48} label={t('exerciseRunner.toUnit')} onPress={onToUnit} />
        )}
      </View>
    </SafeAreaView>
  );
}

interface OutcomeRowProps {
  styles: ReturnType<typeof makeStyles>;
  icon: IconName;
  label: string;
  sub: string | null;
  value?: string;
  onPress?: () => void;
}

/** One line of the outcome list; a wrong exercise's line opens it again. */
function OutcomeRow({ styles, icon, label, sub, value, onPress }: OutcomeRowProps) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.neutral400} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {value !== undefined ? <Text style={styles.rowValue}>{value}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
    >
      {body}
    </PressableScale>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroll: {
      paddingTop: 36,
      paddingHorizontal: 22,
      paddingBottom: 24,
      gap: 22,
    },
    head: {
      gap: 8,
    },
    kicker: {
      ...typography.meta,
      color: colors.neutral500,
    },
    title: {
      ...typography.resumeTitle,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.6,
      color: colors.text,
    },
    lead: {
      ...typography.body,
      lineHeight: 21,
      color: colors.neutral400,
    },
    tile: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radii.card,
      paddingVertical: 16,
    },
    stat: {
      flex: 1,
      paddingHorizontal: 16,
      gap: 2,
    },
    statDivided: {
      borderLeftWidth: 1,
      borderLeftColor: colors.neutral800,
    },
    statValue: {
      ...typography.resumeTitle,
    },
    statLabel: {
      ...typography.meta,
      color: colors.neutral500,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.neutral800,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      ...typography.body,
      color: colors.text,
    },
    rowSub: {
      ...typography.meta,
      color: colors.neutral500,
    },
    rowValue: {
      ...typography.cardTitle,
      color: colors.neutral300,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      gap: 4,
    },
  });
