import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ItemResult } from './runnerMachine';
import { buildResultsSummary } from './resultsSummary';

interface SetResultsScreenProps {
  results: ItemResult[];
  onContinue: () => void;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

function getResultEmoji(handledRatio: number): string {
  if (handledRatio >= 0.9) return '🏆';
  if (handledRatio >= 0.7) return '🎉';
  if (handledRatio >= 0.5) return '👍';
  return '💪';
}

/**
 * Results summary for a finished exercise set — reuses the visual language
 * of LearningScreen's SessionResultsScreen (hero + score card + progress
 * bar + outcome breakdown), adapted for server-graded course exercises:
 * hero tone is driven by `handledRatio` (correct + needsReview), not raw
 * accuracy, since free-form templates always land in "needs review" and
 * that's a successful completion, not a wrong answer.
 */
export function SetResultsScreen({ results, onContinue }: SetResultsScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const summary = buildResultsSummary(results);

  const titleKey =
    summary.handledRatio >= 0.9
      ? 'resultsExcellentTitle'
      : summary.handledRatio >= 0.7
        ? 'resultsGoodTitle'
        : summary.handledRatio >= 0.5
          ? 'resultsOkayTitle'
          : 'resultsKeepGoingTitle';
  const messageKey =
    summary.handledRatio >= 0.9
      ? 'resultsExcellentMessage'
      : summary.handledRatio >= 0.7
        ? 'resultsGoodMessage'
        : summary.handledRatio >= 0.5
          ? 'resultsOkayMessage'
          : 'resultsKeepGoingMessage';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{getResultEmoji(summary.handledRatio)}</Text>
          <Text style={styles.heroTitle}>{t(`exerciseRunner.${titleKey}`)}</Text>
          <Text style={styles.heroMessage}>{t(`exerciseRunner.${messageKey}`)}</Text>
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreMain}>
            <Text style={styles.scorePercent}>{Math.round(summary.accuracy * 100)}%</Text>
            <Text style={styles.scoreLabel}>{t('exerciseRunner.resultsAccuracy')}</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreStat}>
            <Text style={styles.scoreStatValue}>
              {t('exerciseRunner.resultsCorrectOf', {
                correct: summary.correct,
                total: summary.total,
              })}
            </Text>
            <Text style={styles.scoreStatLabel}>{t('exerciseRunner.correct')}</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreStat}>
            <Text style={styles.scoreStatValue}>
              {formatDuration(summary.totalTimeSpentSeconds)}
            </Text>
            <Text style={styles.scoreStatLabel}>{t('exerciseRunner.resultsTime')}</Text>
          </View>
        </View>

        <View style={styles.accuracyBar}>
          <View style={styles.accuracyBg}>
            <View
              style={[
                styles.accuracyFill,
                { width: `${Math.round(summary.accuracy * 100)}%` },
                summary.accuracy >= 0.7 && { backgroundColor: colors.success },
                summary.accuracy < 0.5 && { backgroundColor: colors.error },
              ]}
            />
          </View>
        </View>

        {summary.needsReview > 0 || summary.incorrect > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exerciseRunner.resultsByOutcome')}</Text>
            <View style={styles.outcomeRow}>
              <Text style={styles.outcomeLabel}>{t('exerciseRunner.correct')}</Text>
              <Text style={[styles.outcomeValue, { color: colors.success }]}>
                {summary.correct}
              </Text>
            </View>
            {summary.needsReview > 0 && (
              <View style={styles.outcomeRow}>
                <Text style={styles.outcomeLabel}>{t('exerciseRunner.resultsNeedsReview')}</Text>
                <Text style={styles.outcomeValue}>{summary.needsReview}</Text>
              </View>
            )}
            {summary.incorrect > 0 && (
              <View style={styles.outcomeRow}>
                <Text style={styles.outcomeLabel}>{t('exerciseRunner.incorrect')}</Text>
                <Text style={[styles.outcomeValue, { color: colors.error }]}>
                  {summary.incorrect}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
            <Text style={styles.primaryBtnText}>{t('exerciseRunner.continue')} →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: 24,
      paddingBottom: 40,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 24,
    },
    heroEmoji: {
      fontSize: 72,
      marginBottom: 12,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    heroMessage: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    scoreCard: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    scoreMain: {
      flex: 1,
      alignItems: 'center',
    },
    scorePercent: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.accent,
    },
    scoreLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    scoreDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    scoreStat: {
      flex: 1,
      alignItems: 'center',
    },
    scoreStatValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scoreStatLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    accuracyBar: {
      marginBottom: 24,
    },
    accuracyBg: {
      height: 10,
      backgroundColor: colors.border,
      borderRadius: 5,
      overflow: 'hidden',
    },
    accuracyFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 5,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    outcomeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    outcomeLabel: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    outcomeValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    actions: {
      marginTop: 4,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
