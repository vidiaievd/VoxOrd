import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildMatchPairsAnswer,
  matchPairsCanSubmit,
  readMatchPairsResults,
  toggleLink,
  type Links,
  type MatchPairsContent,
  type MatchPairsResult,
} from './templates/matchPairs';

function invert(links: Links): Links {
  const out: Links = {};
  for (const [slot, item] of Object.entries(links)) out[item] = slot;
  return out;
}

/**
 * `match_pairs` body — slots stacked above a pool of right halves.
 *
 * **Not two columns.** The previous layout put left items and right items in two
 * `flex: 1` columns, which worked only while the two sides were the same length and
 * the same shape. Neither holds any more: the pool carries distractors, so it is
 * strictly longer than the list of slots (8 halves for 5 slots in the seeded content),
 * and `variant: 'halves'` puts a clause on each side, so the text is far too long for
 * half a phone's width. Rows across the full width, with the pool wrapping into chips
 * underneath, takes both.
 *
 * The pool arrives shuffled — server-side, per attempt, from a CSPRNG
 * (`studentSafeContent` in content-service). There is deliberately no second shuffle
 * here: it would add nothing over the first and would make a report of what the student
 * saw impossible to reproduce.
 *
 * Grading is entirely server-side, as for every template in this runner. In the feedback
 * phase each filled slot is coloured from `verdict.details.pairs[]`, and a wrong one
 * shows the explanation the teacher wrote for the half the student actually attached.
 * The correct half is never revealed — that is a separate, recorded action, and the
 * mobile runner does not offer it yet (plan 49, phase 10).
 */
export function MatchPairsBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as MatchPairsContent;
  // Memoised, not just defaulted: `?? []` is a fresh array every render, which would
  // re-run the `poolText` map on each keystroke of the parent's state.
  const slots = useMemo(() => content.slots ?? [], [content.slots]);
  const pool = useMemo(() => content.pool ?? [], [content.pool]);

  const [links, setLinks] = useState<Links>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  useEffect(() => {
    onAnswerChange(buildMatchPairsAnswer(links, slots), matchPairsCanSubmit(links, slots));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  const itemToSlot = useMemo(() => invert(links), [links]);
  const poolText = useMemo(
    () => new Map(pool.map((item) => [item.itemId, item.text])),
    [pool],
  );

  const showFeedback = disabled && verdict !== null;
  const results = useMemo(
    () => (showFeedback ? readMatchPairsResults(verdict!.details) : null),
    [showFeedback, verdict],
  );
  const resultFor = (slotId: string): MatchPairsResult | undefined =>
    results?.find((r) => r.pairId === slotId);

  const remaining = slots.filter((slot) => links[slot.slotId] === undefined).length;

  const handleSlotPress = (slotId: string) => {
    if (disabled) return;
    // Tapping a filled slot empties it; the half returns to the pool.
    if (links[slotId] !== undefined) {
      setLinks((prev) => toggleLink(prev, slotId, prev[slotId]));
      setSelectedSlotId(null);
      return;
    }
    setSelectedSlotId((prev) => (prev === slotId ? null : slotId));
  };

  const handlePoolPress = (itemId: string) => {
    if (disabled) return;
    // A half already placed somewhere: tapping it selects its slot, so the next tap
    // moves it. Otherwise it needs a selected slot to go into.
    const owningSlot = itemToSlot[itemId];
    if (owningSlot && !selectedSlotId) {
      setSelectedSlotId(owningSlot);
      return;
    }
    if (!selectedSlotId) return;
    setLinks((prev) => toggleLink(prev, selectedSlotId, itemId));
    setSelectedSlotId(null);
  };

  const slotStyle = (slotId: string) => {
    if (showFeedback) {
      const result = resultFor(slotId);
      // A slot with no verdict was left empty — unanswered, which is not wrong.
      if (!result) return styles.slot;
      return result.correct ? styles.slotCorrect : styles.slotWrong;
    }
    if (selectedSlotId === slotId) return styles.slotSelected;
    if (links[slotId] !== undefined) return styles.slotFilled;
    return styles.slot;
  };

  const chipStyle = (itemId: string) => {
    if (itemToSlot[itemId]) return styles.chipUsed;
    if (selectedSlotId) return styles.chipSelectable;
    return styles.chip;
  };

  return (
    <View>
      {!disabled ? <Text style={styles.hint}>{t('exerciseRunner.matchPairsHint')}</Text> : null}

      {slots.map((slot) => {
        const attached = links[slot.slotId];
        const result = showFeedback ? resultFor(slot.slotId) : undefined;
        return (
          <View key={slot.slotId}>
            <TouchableOpacity
              style={slotStyle(slot.slotId)}
              onPress={() => handleSlotPress(slot.slotId)}
              disabled={disabled}
              activeOpacity={0.8}
            >
              <Text style={styles.slotLeft}>{slot.left}</Text>
              <View style={styles.slotValueRow}>
                <Text style={attached ? styles.slotFilledText : styles.slotEmptyText}>
                  {attached
                    ? (poolText.get(attached) ?? attached)
                    : t('exerciseRunner.matchPairsEmptySlot')}
                </Text>
                {/* Never colour alone: a correct slot has no explanation under it to
                    carry the verdict, so the green border would otherwise be the whole
                    signal — invisible to anyone who cannot separate it from the red. */}
                {result ? (
                  <Text style={result.correct ? styles.stateCorrect : styles.stateWrong}>
                    {result.correct
                      ? t('exerciseRunner.matchPairsCorrect')
                      : t('exerciseRunner.matchPairsWrong')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {result && !result.correct && result.explanation ? (
              <Text style={styles.explanation}>{result.explanation}</Text>
            ) : null}
          </View>
        );
      })}

      {content.settings?.showRemaining && !disabled ? (
        <Text style={styles.remaining}>
          {t('exerciseRunner.matchPairsRemaining', { count: String(remaining) })}
        </Text>
      ) : null}

      <View style={styles.pool}>
        {pool.map((item) => (
          <TouchableOpacity
            key={item.itemId}
            style={chipStyle(item.itemId)}
            onPress={() => handlePoolPress(item.itemId)}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <Text style={styles.chipText}>{item.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) => {
  const slotBase = {
    backgroundColor: colors.backgroundCard,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  } as const;
  const chipBase = {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.backgroundCard,
  } as const;

  return StyleSheet.create({
    hint: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 14,
      lineHeight: 18,
    },
    slot: slotBase,
    slotSelected: { ...slotBase, backgroundColor: colors.accentLight, borderColor: colors.accent },
    slotFilled: { ...slotBase, borderColor: colors.textSecondary },
    slotCorrect: { ...slotBase, backgroundColor: 'rgba(52, 199, 89, 0.12)', borderColor: colors.success },
    slotWrong: { ...slotBase, backgroundColor: 'rgba(255, 59, 48, 0.10)', borderColor: colors.danger },
    slotLeft: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 21,
    },
    slotFilledText: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 21,
      marginTop: 4,
    },
    slotEmptyText: {
      fontSize: 14,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 20,
      marginTop: 4,
    },
    slotValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    stateCorrect: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.success,
      marginLeft: 8,
      marginTop: 4,
    },
    stateWrong: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.danger,
      marginLeft: 8,
      marginTop: 4,
    },
    explanation: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: -4,
      marginBottom: 12,
      paddingHorizontal: 14,
    },
    remaining: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 6,
      marginBottom: 8,
    },
    pool: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
    },
    chip: chipBase,
    chipSelectable: { ...chipBase, borderColor: colors.accent },
    chipUsed: { ...chipBase, opacity: 0.4, borderColor: colors.textSecondary },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
};
