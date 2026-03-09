import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import {
  sessionRepository,
  SessionSummary,
} from '../../repositories/SessionRepository';
import { ExerciseType } from '../../db/types';

interface SessionResultsScreenProps {
  sessionId: number;
  onContinue: () => void;
  onRepeat: () => void;
}

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  flashcard: 'Flashcards',
  matching: 'Matching',
  quiz: 'Quick Quiz',
  spelling: 'Spelling',
  listening: 'Listening',
  context: 'Context',
};

const EXERCISE_ICONS: Record<ExerciseType, string> = {
  flashcard: '🃏',
  matching: '🔗',
  quiz: '⚡',
  spelling: '✍️',
  listening: '🎧',
  context: '📝',
};

function getResultEmoji(accuracy: number): string {
  if (accuracy >= 0.9) return '🏆';
  if (accuracy >= 0.7) return '🎉';
  if (accuracy >= 0.5) return '👍';
  return '💪';
}

function getResultTitle(accuracy: number): string {
  if (accuracy >= 0.9) return 'Excellent!';
  if (accuracy >= 0.7) return 'Well done!';
  if (accuracy >= 0.5) return 'Good effort!';
  return 'Keep going!';
}

function getResultMessage(accuracy: number): string {
  if (accuracy >= 0.9) return 'Your memory is getting stronger.';
  if (accuracy >= 0.7) return 'You are making great progress.';
  if (accuracy >= 0.5) return 'Practice makes perfect.';
  return 'Every mistake helps you learn faster.';
}

function formatDuration(startedAt: number, finishedAt: number | null): string {
  if (!finishedAt) return '—';
  const seconds = Math.round((finishedAt - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

export function SessionResultsScreen({
  sessionId,
  onContinue,
  onRepeat,
}: SessionResultsScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load session results.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const accuracy = summary.accuracy;
  const duration = formatDuration(
    summary.session.startedAt,
    summary.session.finishedAt,
  );
  const xp = summary.session.xpEarned;
  const exercises = Object.entries(summary.byExercise) as [
    ExerciseType,
    { total: number; correct: number },
  ][];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{getResultEmoji(accuracy)}</Text>
          <Text style={styles.heroTitle}>{getResultTitle(accuracy)}</Text>
          <Text style={styles.heroMessage}>{getResultMessage(accuracy)}</Text>
        </View>

        {/* Score card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreMain}>
            <Text style={styles.scorePercent}>
              {Math.round(accuracy * 100)}%
            </Text>
            <Text style={styles.scoreLabel}>accuracy</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreStat}>
            <Text style={styles.scoreStatValue}>
              {summary.correctAnswers}/{summary.totalAnswers}
            </Text>
            <Text style={styles.scoreStatLabel}>correct</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreStat}>
            <Text style={styles.scoreStatValue}>{duration}</Text>
            <Text style={styles.scoreStatLabel}>duration</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreStat}>
            <Text style={[styles.scoreStatValue, { color: colors.accent }]}>
              +{xp}
            </Text>
            <Text style={styles.scoreStatLabel}>XP</Text>
          </View>
        </View>

        {/* Accuracy bar */}
        <View style={styles.accuracyBar}>
          <View style={styles.accuracyBg}>
            <View
              style={[
                styles.accuracyFill,
                { width: `${Math.round(accuracy * 100)}%` },
                accuracy >= 0.7 && { backgroundColor: colors.success },
                accuracy < 0.5 && { backgroundColor: colors.error },
              ]}
            />
          </View>
        </View>

        {/* Per-exercise breakdown */}
        {exercises.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By exercise</Text>
            {exercises.map(([type, stats]) => {
              const pct =
                stats.total > 0
                  ? Math.round((stats.correct / stats.total) * 100)
                  : 0;
              return (
                <View key={type} style={styles.exerciseRow}>
                  <Text style={styles.exerciseIcon}>
                    {EXERCISE_ICONS[type]}
                  </Text>
                  <Text style={styles.exerciseLabel}>
                    {EXERCISE_LABELS[type]}
                  </Text>
                  <View style={styles.exerciseBarBg}>
                    <View
                      style={[
                        styles.exerciseBarFill,
                        { width: `${pct}%` },
                        pct >= 70 && { backgroundColor: colors.success },
                        pct < 50 && { backgroundColor: colors.error },
                      ]}
                    />
                  </View>
                  <Text style={styles.exercisePct}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* XP badge */}
        {xp > 0 && (
          <View style={styles.xpBadge}>
            <Text style={styles.xpBadgeIcon}>⭐</Text>
            <Text style={styles.xpBadgeText}>
              You earned <Text style={styles.xpBadgeValue}>+{xp} XP</Text> this
              session
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
            <Text style={styles.primaryBtnText}>Continue →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={onRepeat}>
            <Text style={styles.outlineBtnText}>Repeat session</Text>
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
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    errorText: {
      fontSize: 15,
      color: colors.textMuted,
      marginBottom: 24,
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
    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    exerciseIcon: {
      fontSize: 18,
      marginRight: 8,
      width: 24,
      textAlign: 'center',
    },
    exerciseLabel: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '500',
      width: 90,
    },
    exerciseBarBg: {
      flex: 1,
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
      marginRight: 8,
    },
    exerciseBarFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 4,
    },
    exercisePct: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      width: 36,
      textAlign: 'right',
    },
    xpBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accentLight,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 24,
    },
    xpBadgeIcon: {
      fontSize: 20,
      marginRight: 8,
    },
    xpBadgeText: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    xpBadgeValue: {
      fontWeight: '700',
      color: colors.accent,
    },
    actions: {
      marginTop: 4,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 10,
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
    outlineBtn: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
    },
    outlineBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
