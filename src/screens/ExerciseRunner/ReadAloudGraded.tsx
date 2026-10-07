import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import {
  readMarks,
  readSpeakingSnapshot,
  scorePrompts,
  type ShowModelPolicy,
  type ShowRubricPolicy,
  type SubmittedRecording,
} from '../../lib/readAloud';
import { TakeRow, type TakePlayback, type TakeSource } from './ReadAloudParts';
import { outcomeOf, type GradedVerdict } from './templates/readAloud';

export interface ReadAloudGradedProps {
  verdict: GradedVerdict;
  revision: string;
  showRubric: ShowRubricPolicy;
  showModel: ShowModelPolicy;
  /** What was handed in, prompt by prompt, in that order. */
  recordings: readonly SubmittedRecording[];
  labelOf: (itemId: string) => string;
  sourceOf: (assetId: string) => TakeSource;
  playback: TakePlayback;
  /** The model reading can be heard again — set only when there is a clip and `showModel` allows. */
  onPlayModel?: () => void;
  /** Offered when the verdict is a return and `revision: 'return'`. */
  onRedo?: () => void;
}

/**
 * The teacher's verdict, as the learner reads it — the web's `ReadAloudGraded` (the prototype's
 * `GradedCard`, per prompt; plan 70 Q1-A), on the phone.
 *
 * Three prompts are three verdicts, never one averaged mark (README idea 1): every prompt gets
 * its own points, its criteria with the level the teacher chose and that level's descriptor,
 * and the teacher's comment. The head says how the whole went — the outcome, and for more than
 * one prompt how many passed.
 *
 * The points are added up with the function the server used (`scorePrompts`, mirrored from the
 * kernel), against the snapshot it froze — so the number and the chip cannot come apart. The
 * verdict itself is the server's (`passed`, `approved` per prompt): nothing here decides it.
 */
export function ReadAloudGraded({
  verdict,
  revision,
  showRubric,
  showModel,
  recordings,
  labelOf,
  sourceOf,
  playback,
  onPlayModel,
  onRedo,
}: ReadAloudGradedProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const outcome = outcomeOf(verdict.passed, revision);
  const ok = outcome === 'passed';

  const snapshot = readSpeakingSnapshot(verdict.snapshot);
  const marks = readMarks(verdict.marks);
  const itemIds = recordings.map(r => r.itemId);
  const score =
    snapshot === null ? null : scorePrompts(snapshot, marks, itemIds);
  const byItem = new Map(verdict.decisions.map(d => [d.itemId, d]));
  const criteria =
    showRubric === 'never' || snapshot === null
      ? []
      : snapshot.criteria.filter(c => c.studentVisible);
  const single = recordings.length === 1;
  const passedCount = itemIds.filter(
    id => byItem.get(id)?.approved === true,
  ).length;
  const first = score?.prompts[0];

  return (
    <View
      style={[
        styles.card,
        { borderColor: ok ? colors.success : colors.warning },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <View style={[styles.chip, ok ? styles.chipOk : styles.chipAgain]}>
          <Text
            style={[
              styles.chipText,
              { color: ok ? colors.success : colors.warning },
            ]}
          >
            {ok ? '✓ ' : outcome === 'rewrite' ? '↻ ' : '✕ '}
            {outcome === 'passed'
              ? t('exerciseRunner.readAloud.graded.outcome.passed')
              : outcome === 'rewrite'
              ? t('exerciseRunner.readAloud.graded.outcome.rewrite')
              : t('exerciseRunner.readAloud.graded.outcome.failed')}
          </Text>
        </View>
        <View style={styles.flex} />
        {single && first !== undefined ? (
          <Text style={styles.points}>
            {t('exerciseRunner.readAloud.graded.points', {
              score: first.outcome.points,
              max: first.outcome.max,
            })}
          </Text>
        ) : !single ? (
          <Text style={styles.points}>
            {t('exerciseRunner.readAloud.graded.passedCount', {
              k: passedCount,
              n: recordings.length,
            })}
          </Text>
        ) : null}
      </View>

      {recordings.map((r, i) => {
        const result =
          score?.prompts.find(p => p.itemId === r.itemId)?.outcome ?? null;
        const decision = byItem.get(r.itemId);
        return (
          <View
            key={r.itemId}
            style={
              single ? styles.section : [styles.section, styles.sectionRule]
            }
          >
            {!single ? (
              <>
                <View style={styles.promptHead}>
                  <Text style={styles.promptLabel} numberOfLines={1}>
                    {labelOf(r.itemId)}
                  </Text>
                  {decision !== undefined ? (
                    <Text
                      style={[
                        styles.promptVerdict,
                        {
                          color: decision.approved
                            ? colors.success
                            : colors.warning,
                        },
                      ]}
                    >
                      {decision.approved
                        ? t('exerciseRunner.readAloud.graded.promptPassed')
                        : t('exerciseRunner.readAloud.graded.promptAgain')}
                    </Text>
                  ) : null}
                  {result !== null ? (
                    <Text style={styles.points}>
                      {t('exerciseRunner.readAloud.graded.points', {
                        score: result.points,
                        max: result.max,
                      })}
                    </Text>
                  ) : null}
                </View>
                <TakeRow
                  n={i + 1}
                  label={labelOf(r.itemId)}
                  seconds={r.seconds}
                  source={sourceOf(r.assetId)}
                  playKey={`graded:${r.assetId}`}
                  playback={playback}
                  selected={decision?.approved === true}
                  interactive
                />
              </>
            ) : null}

            {showRubric === 'never' || snapshot === null ? (
              <Text style={styles.muted}>
                {t('exerciseRunner.readAloud.graded.hidden')}
              </Text>
            ) : (
              criteria.map(c => {
                const level = marks[`${r.itemId}:${c.id}`] ?? 0;
                const descriptor = c.levels[level]?.trim() ?? '';
                return (
                  <View key={c.id} style={styles.critRow}>
                    <View style={styles.flex}>
                      <Text style={styles.critName}>{c.name}</Text>
                      {descriptor !== '' ? (
                        <Text style={styles.critDesc}>{descriptor}</Text>
                      ) : null}
                    </View>
                    <View style={styles.dots}>
                      {[0, 1, 2].map(d => (
                        <View
                          key={d}
                          style={[styles.dot, d < level ? styles.dotOn : null]}
                        />
                      ))}
                      <Text style={styles.mark}>
                        {t('exerciseRunner.readAloud.graded.mark', {
                          mark: level,
                        })}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            {decision?.comment !== undefined &&
            decision.comment.trim() !== '' ? (
              <Text style={styles.comment}>{decision.comment}</Text>
            ) : null}
          </View>
        );
      })}

      {verdict.comment !== null && verdict.comment.trim() !== '' ? (
        <Text style={styles.comment}>{verdict.comment}</Text>
      ) : null}

      {showModel === 'afterGraded' && onPlayModel !== undefined ? (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onPlayModel}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>
            ▶ {t('exerciseRunner.readAloud.graded.model')}
          </Text>
        </TouchableOpacity>
      ) : null}

      {outcome === 'rewrite' && onRedo !== undefined ? (
        <TouchableOpacity
          style={styles.primary}
          onPress={onRedo}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            ↻ {t('exerciseRunner.readAloud.graded.redo')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    card: {
      gap: 10,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: colors.backgroundCard,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    chip: {
      borderRadius: 999,
      paddingVertical: 3,
      paddingHorizontal: 10,
    },
    chipOk: { backgroundColor: 'rgba(52, 199, 89, 0.12)' },
    chipAgain: { backgroundColor: 'rgba(255, 159, 67, 0.14)' },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    points: {
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.textPrimary,
    },
    section: { gap: 6 },
    sectionRule: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    promptHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    promptLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    promptVerdict: {
      fontSize: 12,
      fontWeight: '600',
    },
    critRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: 8,
    },
    critName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    critDesc: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textSecondary,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotOn: { backgroundColor: colors.accent },
    mark: {
      marginLeft: 4,
      fontFamily: 'monospace',
      fontSize: 12,
      color: colors.textMuted,
    },
    muted: {
      fontSize: 12,
      color: colors.textMuted,
    },
    comment: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    secondary: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    secondaryText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });
