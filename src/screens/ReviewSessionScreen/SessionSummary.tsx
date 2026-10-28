import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, Overline, ProgressTrack } from '../../components/ui';
import { StatStrip } from '../../components/practice';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import type { ReviewRating } from '../../api/srs';
import type { PhaseScore } from '../../lib/sessionEvidence';
import { useReviewQueue } from '../../hooks/useReviewQueue';
import { deepSessionRepository } from '../../repositories/DeepSessionRepository';
import type { DeepSessionWord } from '../../hooks/useDeepSession';
import { formatSetTime } from '../ExerciseRunner/resultsSummary';

const PHASE_KEY: Record<string, string> = {
  listening: 'review.phaseListening',
  quiz: 'review.phaseQuiz',
  spelling: 'review.phaseSpelling',
};

const HARD_WORDS_SHOWN = 5;

interface SessionSummaryProps {
  submitted: Array<{ wordId: number; rating: ReviewRating }>;
  ungradedCount: number;
  byPhase: PhaseScore[];
  elapsedMs: number;
  onDone: () => void;
}

/** Hard words first by severity — `AGAIN`, then `HARD` — in the order they were posted. */
export function hardWordIds(
  submitted: Array<{ wordId: number; rating: ReviewRating }>,
): number[] {
  return [
    ...submitted.filter(e => e.rating === 'AGAIN'),
    ...submitted.filter(e => e.rating === 'HARD'),
  ].map(e => e.wordId);
}

/**
 * What the session saved (Practice §7.5, 6f): three figures, how each phase went and the words
 * that come back soonest. The learner never picks a rating and the summary does not show the
 * AGAIN/HARD/GOOD/EASY split either — «hard» is the two lower ratings, the words behind it are
 * listed. Ratings still waiting for the network are said to be on the phone.
 */
export function SessionSummary({
  submitted,
  ungradedCount,
  byPhase,
  elapsedMs,
  onDone,
}: SessionSummaryProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const pendingCount = useReviewQueue();
  const hardIds = hardWordIds(submitted);
  const [hardWords, setHardWords] = useState<DeepSessionWord[]>([]);

  const hardKey = hardIds.slice(0, HARD_WORDS_SHOWN).join(',');
  useEffect(() => {
    const ids = hardKey ? hardKey.split(',').map(Number) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    deepSessionRepository.loadWordsByIds(ids).then(words => {
      if (cancelled) return;
      const byId = new Map(words.map(w => [w.wordId, w]));
      setHardWords(ids.map(id => byId.get(id)).filter((w): w is DeepSessionWord => !!w));
    });
    return () => {
      cancelled = true;
    };
  }, [hardKey]);

  const sectionTitle = (text: string) => <Overline>{text}</Overline>;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}
      >
        <View style={{ gap: 6 }}>
          <Overline style={{ color: colors.accent300 }}>{t('reviewSession.done')}</Overline>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}
          >
            {t('review.sessionDone')}
          </Text>
        </View>

        <StatStrip
          items={[
            { value: String(submitted.length), label: t('reviewSession.statCards') },
            {
              value: formatSetTime(Math.round(elapsedMs / 1000)),
              label: t('reviewSession.statTime'),
            },
            { value: String(hardIds.length), label: t('reviewSession.statHard'), accent: true },
          ]}
        />

        {byPhase.length > 0 ? (
          <View style={{ gap: 10 }}>
            {sectionTitle(t('reviewSession.byPhase'))}
            {byPhase.map(score => {
              const pct = Math.round((score.correct / score.total) * 100);
              return (
                <View
                  key={score.mode}
                  accessible
                  accessibilityLabel={`${t(PHASE_KEY[score.mode] ?? score.mode)}: ${t(
                    'reviewSession.phaseCorrect',
                    { correct: score.correct, total: score.total },
                  )}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Text style={[typography.secondary, { width: 96, color: colors.neutral300 }]}>
                    {t(PHASE_KEY[score.mode] ?? score.mode)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <ProgressTrack value={score.correct / score.total} fill={colors.accent600} />
                  </View>
                  <Text
                    style={[
                      typography.secondary,
                      { width: 34, textAlign: 'right', color: colors.neutral400 },
                    ]}
                  >
                    {`${pct}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {hardWords.length > 0 ? (
          <View>
            <View style={{ paddingBottom: 6 }}>{sectionTitle(t('reviewSession.hardWords'))}</View>
            {hardWords.map(word => (
              <View
                key={word.wordId}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  paddingVertical: 11,
                  borderTopWidth: 1,
                  borderTopColor: colors.neutral800,
                }}
              >
                <Text style={[typography.body, { flex: 1, color: colors.text }]}>{word.word}</Text>
                <Text
                  numberOfLines={1}
                  style={[typography.body, { flexShrink: 1, color: colors.neutral400 }]}
                >
                  {word.translation}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {ungradedCount > 0 ? (
          // Words that were never answered stay due on purpose — reporting them is honest,
          // and the alternative (a default rating) would corrupt the schedule.
          <Text style={[typography.secondary, { color: colors.neutral400 }]}>
            {t('review.stillDue', { count: ungradedCount })}
          </Text>
        ) : null}

        {pendingCount > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              borderWidth: 1,
              borderColor: colors.neutral800,
              borderRadius: radii.card,
              paddingVertical: 14,
              paddingHorizontal: 16,
            }}
          >
            <Icon name="CloudSlash" size={20} color={colors.neutral400} />
            <Text style={[typography.secondary, { flex: 1, color: colors.neutral300 }]}>
              {t('reviewSession.queuedOffline', { count: pendingCount })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.neutral800,
          paddingTop: 12,
          paddingHorizontal: 20,
          paddingBottom: 12 + insets.bottom,
        }}
      >
        <Button block label={t('reviewSession.done')} onPress={onDone} />
      </View>
    </View>
  );
}
