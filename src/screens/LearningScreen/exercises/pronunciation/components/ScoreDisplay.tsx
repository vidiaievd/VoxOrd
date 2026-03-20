import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../../theme/colors';
import { FeedbackItem, PronunciationScore } from '../../../../../services/asr/pronunciation';


interface ScoreDisplayProps {
  score: PronunciationScore;
}

export function ScoreDisplay({ score }: ScoreDisplayProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const color =
    score.overall >= 80
      ? colors.success
      : score.overall >= 60
      ? colors.accent
      : colors.error;

  return (
    <View style={styles.container}>
      <View style={styles.scoreMain}>
        <Text style={[styles.scoreValue, { color }]}>{score.overall}</Text>
        <Text style={styles.scoreLabel}>/ 100</Text>
      </View>

      <View style={styles.scoreRow}>
        <ScorePill label="Accuracy" value={score.accuracy} />
        <ScorePill label="Fluency" value={score.fluency} />
      </View>

      {score.feedback.length > 0 && (
        <View style={styles.feedbackRow}>
          {score.feedback.slice(0, 4).map((item: FeedbackItem, i: number) => (
            <FeedbackChip key={i} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const color =
    value >= 80 ? colors.success : value >= 60 ? colors.accent : colors.error;

  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function FeedbackChip({ item }: { item: FeedbackItem }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const isMissing = item.type === 'missing';
  const isExtra = item.type === 'extra';
  const color =
    item.type === 'wrong'
      ? colors.error
      : isMissing
      ? colors.accent
      : colors.textMuted;

  const label = isMissing
    ? `missing: ${item.expected}`
    : isExtra
    ? `extra: ${item.got}`
    : `${item.got} → ${item.expected}`;

  return (
    <View style={[styles.chip, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 16,
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      alignItems: 'center',
    },
    scoreMain: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 8,
    },
    scoreValue: {
      fontSize: 40,
      fontWeight: '800',
    },
    scoreLabel: {
      fontSize: 16,
      color: colors.textMuted,
      marginLeft: 4,
    },
    scoreRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    feedbackRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    pill: {
      alignItems: 'center',
      borderRadius: 12,
      paddingVertical: 6,
      paddingHorizontal: 16,
      marginHorizontal: 4,
    },
    pillValue: {
      fontSize: 18,
      fontWeight: '800',
    },
    pillLabel: {
      fontSize: 11,
      color: colors.textMuted,
    },
    chip: {
      borderRadius: 8,
      paddingVertical: 3,
      paddingHorizontal: 8,
      margin: 2,
    },
    chipText: {
      fontSize: 12,
    },
  });
