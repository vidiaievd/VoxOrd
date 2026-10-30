import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatStrip } from '../../components/practice';
import { Button, Overline, ProgressTrack, Spinner } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ExerciseType } from '../../db/types';
import {
  sessionRepository,
  SessionSummary,
} from '../../repositories/SessionRepository';
import { formatSetTime } from '../ExerciseRunner/resultsSummary';

interface SessionResultsScreenProps {
  sessionId: number;
  onContinue: () => void;
  onRepeat: () => void;
}

const MODE_KEY: Record<ExerciseType, string> = {
  flashcard: 'modes.flashcard',
  matching: 'modes.matching',
  quiz: 'modes.quiz',
  spelling: 'modes.spelling',
  listening: 'modes.listening',
  context: 'modes.context',
};

/** Practice §7.5 / §8.3: the heading follows the accuracy, with no emoji. */
export function resultTitleKey(accuracy: number): string {
  if (accuracy >= 0.9) return 'results.excellent';
  if (accuracy >= 0.7) return 'results.good';
  if (accuracy >= 0.5) return 'results.okay';
  return 'results.keepGoing';
}

/**
 * What a finished word-set session did (Practice 6f for modes): a heading by accuracy, three
 * figures and how each mode went. XP is no longer shown — what is stored stays as it was.
 */
export function SessionResultsScreen({
  sessionId,
  onContinue,
  onRepeat,
}: SessionResultsScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    sessionRepository.getSummary(sessionId).then(s => {
      setSummary(s);
      setIsLoading(false);
    });
  }, [sessionId]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Spinner size={28} color={colors.accent300} />
      </View>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={['top', 'bottom']}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 14 }}>
          <Text style={[typography.body, { color: colors.neutral400 }]}>
            {t('practice.loadError')}
          </Text>
          <Button block label={t('results.done')} onPress={onContinue} />
        </View>
      </SafeAreaView>
    );
  }

  const { accuracy } = summary;
  const { startedAt, finishedAt } = summary.session;
  const seconds = finishedAt ? Math.max(0, Math.round((finishedAt - startedAt) / 1000)) : 0;
  const modes = Object.entries(summary.byExercise) as [
    ExerciseType,
    { total: number; correct: number },
  ][];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 28,
          paddingHorizontal: 20,
          paddingBottom: 24,
          gap: 18,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}
        >
          {t(resultTitleKey(accuracy))}
        </Text>

        <StatStrip
          items={[
            {
              value: `${Math.round(accuracy * 100)}%`,
              label: t('results.accuracy'),
              accent: true,
            },
            {
              value: `${summary.correctAnswers}/${summary.totalAnswers}`,
              label: t('results.correct'),
            },
            {
              value: finishedAt ? formatSetTime(seconds) : '—',
              label: t('reviewSession.statTime'),
            },
          ]}
        />

        {modes.length > 1 ? (
          <View style={{ gap: 10 }}>
            <Overline>{t('reviewSession.byPhase')}</Overline>
            {modes.map(([type, stats]) => {
              const share = stats.total > 0 ? stats.correct / stats.total : 0;
              const name = t(MODE_KEY[type]);
              return (
                <View
                  key={type}
                  accessible
                  accessibilityLabel={`${name}: ${t('reviewSession.phaseCorrect', {
                    correct: stats.correct,
                    total: stats.total,
                  })}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Text style={[typography.secondary, { width: 96, color: colors.neutral300 }]}>
                    {name}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <ProgressTrack value={share} fill={colors.accent600} />
                  </View>
                  <Text
                    style={[
                      typography.secondary,
                      { width: 34, textAlign: 'right', color: colors.neutral400 },
                    ]}
                  >
                    {`${Math.round(share * 100)}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        <Button block label={t('results.done')} onPress={onContinue} />
        <Button block variant="ghost" label={t('results.again')} onPress={onRepeat} />
      </View>
    </SafeAreaView>
  );
}
