import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getGrammarRuleReview, type GrammarRuleReview } from '../../api/grammarReview';
import { Button, NavHeader, Overline, PressableScale, ProgressTrack, Skeleton } from '../../components/ui';
import { useGrammarRuleReader } from '../../hooks/useGrammarRuleReader';
import { useUnitNumber } from '../../hooks/useUnitNumber';
import { useTranslation } from '../../i18n';
import { idleDays, reviewMinutes } from '../../lib/grammarDue';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

interface GrammarReviewScreenProps {
  ruleId: string;
  courseId: string;
  unitId: string;
  onBack: () => void;
  onOpenRule: () => void;
  /** Runs the review's exercises; Back from the runner returns to Practice. */
  onStart: (exerciseIds: string[]) => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'loaded'; review: GrammarRuleReview }
  | { status: 'error' };

/**
 * A rule's review (Practice 6l): where the learner stands with it, its summary, and the
 * pinned «Repeat» over up to eight exercises — lapsed first, then the longest unpractised,
 * as learning-service orders them. There is no «was {peak}%» (no mastery history is kept),
 * no «where the mistakes are» (no per-subtopic data) and no list of exercise types in the
 * note (the pool is ids only) — see plan 05, step 7.
 */
export function GrammarReviewScreen({
  ruleId,
  courseId,
  unitId,
  onBack,
  onOpenRule,
  onStart,
}: GrammarReviewScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const unitNumber = useUnitNumber(courseId, unitId);
  const rule = useGrammarRuleReader(ruleId, courseId).data;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchReview = useCallback(() => {
    let live = true;
    setLoad({ status: 'loading' });
    getGrammarRuleReview(ruleId)
      .then(review => live && setLoad({ status: 'loaded', review }))
      .catch(() => live && setLoad({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [ruleId]);
  useEffect(fetchReview, [fetchReview]);

  const review = load.status === 'loaded' ? load.review : null;
  const pool = review?.reviewPool ?? [];

  const lastPractice = (() => {
    if (!review) return null;
    const days = idleDays(review.lastPracticedAt, new Date());
    if (days === null) return t('grammarReview.neverPracticed');
    const when =
      days === 0
        ? t('practice.whenToday')
        : days === 1
          ? t('practice.whenYesterday')
          : t('grammarReview.daysAgo', { count: days });
    return t('grammarReview.lastPractice', { when });
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader parentLabel={t('practice.title')} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 18, paddingBottom: 24, gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Overline style={{ color: colors.accent300 }}>
            {unitNumber ? t('grammarReview.kicker', { unit: unitNumber }) : t('grammarRuleReader.title')}
          </Overline>
          {rule ? (
            <Text style={[typography.resumeTitle, { color: colors.text }]} accessibilityRole="header">
              {rule.displayTitle}
            </Text>
          ) : (
            <Skeleton width={220} height={22} />
          )}
          {lastPractice ? (
            <Text style={[typography.secondary, { color: colors.neutral400 }]}>{lastPractice}</Text>
          ) : null}
        </View>

        {review ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typography.meta, { color: colors.neutral400 }]}>{t('grammarReview.mastery')}</Text>
              <Text style={[typography.meta, { color: colors.neutral400 }]}>{`${review.masteryPercent}%`}</Text>
            </View>
            <ProgressTrack value={review.masteryPercent / 100} />
          </View>
        ) : null}

        {rule ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}>
            {rule.displaySummary ? (
              <Text style={[typography.body, { lineHeight: 21, color: colors.neutral200 }]}>
                {rule.displaySummary}
              </Text>
            ) : null}
            <PressableScale accessibilityRole="link" onPress={onOpenRule} hitSlop={8}>
              <Text style={[typography.secondary, { color: colors.accent300 }]}>{t('grammarReview.openRule')}</Text>
            </PressableScale>
          </View>
        ) : null}

        {pool.length > 0 ? (
          <Text style={[typography.secondary, { color: colors.neutral500 }]}>
            {t('grammarReview.poolNote', { count: pool.length })}
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: colors.neutral800,
        }}
      >
        {load.status === 'error' ? (
          <>
            <Text style={[typography.secondary, { color: colors.neutral400, textAlign: 'center' }]}>
              {t('grammarReview.loadError')}
            </Text>
            <Button block size={48} variant="secondary" label={t('courses.retry')} onPress={fetchReview} />
          </>
        ) : review && pool.length === 0 ? (
          <Text style={[typography.secondary, { color: colors.neutral400, textAlign: 'center' }]}>
            {t('grammarReview.emptyPool')}
          </Text>
        ) : (
          <Button
            block
            size={48}
            variant="primary"
            icon="Play"
            label={
              pool.length > 0
                ? t('grammarReview.cta', { count: pool.length, min: reviewMinutes(pool.length) })
                : t('grammarRuleReader.goToPractice')
            }
            disabled={load.status === 'loading'}
            onPress={() => onStart(pool)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
