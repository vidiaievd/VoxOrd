import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildMatchPairsAnswer,
  extractExpectedPairs,
  isLinkExpected,
  matchPairsCanSubmit,
  toggleLink,
  type Links,
  type MatchPairsContent,
} from './templates/matchPairs';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function invert(links: Links): Links {
  const out: Links = {};
  for (const [left, right] of Object.entries(links)) out[right] = left;
  return out;
}

/**
 * `match_pairs` body. Two-column tap-to-select-then-link interaction adapted
 * from MatchingExercise.tsx (visual language only — that screen auto-grades
 * each pair locally and removes matched items; this one accumulates a full
 * set of links and submits them together for server grading, since an
 * attempt covers the whole exercise, not one pair at a time).
 *
 * Server response has no per-pair correctness (only the item-level `correct`
 * flag/score), but PRACTICE mode's `feedback.correctAnswer` carries the full
 * expected pair set, so feedback highlighting IS possible here — reusing that
 * value to recolor each link, the same way MultipleChoiceBody does.
 *
 * `verdict.correct` is checked first (available in both PRACTICE and GRADED):
 * if the whole attempt is correct, every linked pair is green regardless of
 * `expectedPairs`. Only a wrong attempt falls back to `expectedPairs` (PRACTICE
 * only) to tell which individual links were right vs wrong; in GRADED mode a
 * wrong attempt still can't distinguish per-pair, so every link reds out —
 * same limitation MultipleChoiceBody has for its own GRADED wrong case.
 */
export function MatchPairsBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as MatchPairsContent;

  const [rightOrder] = useState(() => shuffled(content.right_items));
  const [links, setLinks] = useState<Links>({});
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);

  useEffect(() => {
    onAnswerChange(
      buildMatchPairsAnswer(links, content.left_items),
      matchPairsCanSubmit(links, content.left_items),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  const rightToLeft = useMemo(() => invert(links), [links]);

  const showFeedback = disabled && verdict !== null;
  const expectedPairs = showFeedback ? extractExpectedPairs(verdict!.feedback.correctAnswer) : null;

  const handleLeftPress = (id: string) => {
    if (disabled) return;
    setSelectedLeftId((prev) => (prev === id ? null : id));
  };

  const handleRightPress = (rightId: string) => {
    if (disabled) return;
    if (selectedLeftId) {
      setLinks((prev) => toggleLink(prev, selectedLeftId, rightId));
      setSelectedLeftId(null);
      return;
    }
    // No left selected: tapping an already-linked right re-selects its
    // partner, so tapping the same right again unlinks it.
    const partnerLeft = rightToLeft[rightId];
    if (partnerLeft) setSelectedLeftId(partnerLeft);
  };

  const leftStyle = (id: string) => {
    const linkedRight = links[id];
    if (showFeedback) {
      if (!linkedRight) return styles.item;
      if (verdict!.correct) return styles.itemCorrect;
      if (expectedPairs && isLinkExpected(expectedPairs, id, linkedRight)) return styles.itemCorrect;
      return styles.itemWrong;
    }
    if (selectedLeftId === id) return styles.itemSelected;
    if (linkedRight) return styles.itemLinked;
    return styles.item;
  };

  const rightStyle = (id: string) => {
    const partnerLeft = rightToLeft[id];
    if (showFeedback) {
      if (!partnerLeft) return styles.item;
      if (verdict!.correct) return styles.itemCorrect;
      if (expectedPairs && isLinkExpected(expectedPairs, partnerLeft, id)) return styles.itemCorrect;
      return styles.itemWrong;
    }
    if (selectedLeftId && links[selectedLeftId] === id) return styles.itemSelected;
    if (partnerLeft) return styles.itemLinked;
    return styles.item;
  };

  return (
    <View>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}
      <View style={styles.columns}>
        <View style={styles.column}>
          {content.left_items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={leftStyle(item.id)}
              onPress={() => handleLeftPress(item.id)}
              disabled={disabled}
              activeOpacity={0.8}
            >
              <Text style={styles.itemText}>{item.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.column}>
          {rightOrder.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={rightStyle(item.id)}
              onPress={() => handleRightPress(item.id)}
              disabled={disabled}
              activeOpacity={0.8}
            >
              <Text style={styles.itemText}>{item.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    context: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 14,
      lineHeight: 18,
    },
    columns: {
      flexDirection: 'row',
    },
    column: {
      flex: 1,
      marginRight: 8,
    },
    item: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    itemSelected: {
      backgroundColor: colors.accentLight,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.accent,
    },
    itemLinked: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.textSecondary,
    },
    itemCorrect: {
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.success,
    },
    itemWrong: {
      backgroundColor: 'rgba(255, 59, 48, 0.10)',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.danger,
    },
    itemText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
