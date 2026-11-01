import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ApiError } from '../../api/client';
import { addReachedAtom } from '../../api/srs';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { Feedback, FeedbackAtom, FeedbackItem, PrecheckResult } from '../../api/precheck';
import {
  accuracyBand,
  checksLeft,
  noticeOf,
  rulesToRevisit,
  wordsByPassage,
  type AccuracyBand,
} from './templates/precheck';

/**
 * What a model said about work not yet handed in (platform plan 84, VoxOrd step 7).
 *
 * A rehearsal, not a mark: the panel says so under its title (Q5 — the grade is the teacher's),
 * draws the remarks of a text or the words heard of a reading, and says how many checks are
 * left. Colour carries no verdict (Courses §8.5): a well-read word is lit with the accent, a
 * poor one is dimmed.
 */
export function PrecheckPanel({
  result,
  passageLabel,
  itemLabel,
  heardItemIds,
}: {
  result: PrecheckResult;
  /** Names a passage of a reading by its place in the exercise (0-based); absent for a text. */
  passageLabel?: (passageIndex: number) => string;
  /** Names a passage by its id, for the share of it read. */
  itemLabel?: (itemId: string) => string;
  /**
   * The passages that were sent. The engine reports the whole exercise, and a passage not
   * recorded yet would read as «0%» — which is not what was heard, so only these are drawn.
   */
  heardItemIds?: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const notice = noticeOf(result);
  if (notice.kind === 'none') return null;

  const left = checksLeft(result.remaining);
  const readings = (result.reading?.prompts ?? []).filter(
    (prompt) => heardItemIds === undefined || heardItemIds.has(prompt.itemId),
  );
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{t('exerciseRunner.precheck.title')}</Text>
      <Text style={styles.sub}>{t('exerciseRunner.precheck.subtitle')}</Text>

      {notice.kind === 'line' ? (
        <Text style={styles.line}>{t(`exerciseRunner.precheck.line.${notice.key}`)}</Text>
      ) : (
        <>
          {readings.length > 0 ? (
            <View style={styles.readingRow}>
              {readings.map((prompt, i) => (
                <Text key={prompt.itemId} style={[styles.readingChip, prompt.passed && styles.readingChipOn]}>
                  {itemLabel ? itemLabel(prompt.itemId) : String(i + 1)} · {prompt.percent}%
                </Text>
              ))}
            </View>
          ) : null}
          {result.feedback !== null ? (
            <FeedbackBody feedback={result.feedback} courseId={result.courseId} passageLabel={passageLabel} styles={styles} colors={colors} />
          ) : null}
        </>
      )}

      {left !== null ? (
        <Text style={styles.left}>{t('exerciseRunner.precheck.left', { count: left })}</Text>
      ) : null}
    </View>
  );
}

function FeedbackBody({
  feedback,
  courseId,
  passageLabel,
  styles,
  colors,
}: {
  feedback: Feedback;
  courseId: string | null;
  passageLabel?: (passageIndex: number) => string;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorScheme;
}) {
  const { t } = useTranslation();
  const groups = wordsByPassage(feedback);
  const scored = feedback.words.some((w) => w.accuracy !== null);
  const bandStyle: Record<AccuracyBand, object> = {
    good: { borderColor: colors.accentBase, backgroundColor: colors.accent900 },
    fair: { borderColor: colors.neutral500 },
    low: { borderColor: colors.neutral800, borderStyle: 'dashed', opacity: 0.8 },
  };

  return (
    <>
      {feedback.summary.trim() !== '' ? <Text style={styles.summary}>{feedback.summary}</Text> : null}

      {groups.map((group, g) => (
        <View key={`${group.passageIndex}-${g}`} style={styles.passage}>
          {group.passageIndex !== null && passageLabel && groups.length > 1 ? (
            <Text style={styles.passageName}>{passageLabel(group.passageIndex)}</Text>
          ) : null}
          <View style={styles.words}>
            {group.words.map((word, i) => (
              <View
                key={`${word.text}-${i}`}
                style={[
                  styles.word,
                  word.accuracy !== null ? bandStyle[accuracyBand(word.accuracy)] : null,
                ]}
              >
                <Text style={styles.wordText}>{word.text}</Text>
                {word.accuracy !== null ? (
                  <Text style={styles.wordScore}>{Math.round(word.accuracy)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
      {groups.length > 0 && !scored ? (
        <Text style={styles.sub}>{t('exerciseRunner.precheck.noScores')}</Text>
      ) : null}

      {feedback.items.length === 0 && groups.length === 0 ? (
        <Text style={styles.line}>{t('exerciseRunner.precheck.noRemarks')}</Text>
      ) : null}
      {feedback.items.map((item, i) => (
        <Remark key={i} item={item} styles={styles} />
      ))}
      <Revisit rules={rulesToRevisit(feedback)} courseId={courseId} styles={styles} />
    </>
  );
}

type AddState = 'idle' | 'busy' | 'added' | 'failed' | 'gone';

/**
 * «Worth revisiting» (platform plan 85, step 7): the rules the remarks point at. A rule already
 * in the learner's review was pulled closer by the server — said as such, with no button. A
 * rule reached but without a card gets «Add». Nothing here promises when the rule comes up:
 * the cards of rules are not drawn in the due queue yet.
 */
function Revisit({
  rules,
  courseId,
  styles,
}: {
  rules: FeedbackAtom[];
  courseId: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  if (rules.length === 0) return null;
  return (
    <View style={styles.revisit}>
      <Text style={styles.kind}>{t('exerciseRunner.precheck.revisit.title')}</Text>
      {rules.map((rule) => (
        <RevisitRule key={rule.atomId} rule={rule} courseId={courseId} styles={styles} />
      ))}
    </View>
  );
}

function RevisitRule({
  rule,
  courseId,
  styles,
}: {
  rule: FeedbackAtom;
  courseId: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<AddState>('idle');

  const add = async () => {
    if (courseId === null || state === 'busy') return;
    setState('busy');
    try {
      await addReachedAtom(rule.atomId, courseId);
      setState('added');
    } catch (e) {
      // 422: the server does not count the rule as reached — the offer was wrong, drop it.
      setState(e instanceof ApiError && e.status === 422 ? 'gone' : 'failed');
    }
  };

  const offer = rule.status === 'covered' && courseId !== null && state !== 'gone' && state !== 'added';
  return (
    <View style={styles.revisitRow}>
      <View style={styles.revisitName}>
        <Text style={styles.fragment}>{rule.ruleTitle}</Text>
        <Text style={styles.sub}>{rule.title}</Text>
        {rule.status === 'in_queue' ? (
          <Text style={styles.sub}>{t('exerciseRunner.precheck.revisit.marked')}</Text>
        ) : null}
        {state === 'added' ? <Text style={styles.sub}>{t('exerciseRunner.precheck.revisit.added')}</Text> : null}
        {state === 'failed' ? <Text style={styles.sub}>{t('exerciseRunner.precheck.revisit.failed')}</Text> : null}
      </View>
      {offer ? (
        <TouchableOpacity
          style={[styles.addButton, state === 'busy' && styles.buttonOff]}
          onPress={() => void add()}
          disabled={state === 'busy'}
          accessibilityRole="button"
          accessibilityLabel={t('exerciseRunner.precheck.revisit.add')}
        >
          <Text style={styles.addText}>{t('exerciseRunner.precheck.revisit.add')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Remark({ item, styles }: { item: FeedbackItem; styles: ReturnType<typeof makeStyles> }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.remark, item.severity === 'major' && styles.remarkMajor]}>
      <Text style={styles.kind}>{t(`exerciseRunner.precheck.kind.${item.kind}`)}</Text>
      {item.original !== null ? (
        <Text style={styles.fragment}>
          {item.suggestion !== null ? `${item.original}  →  ${item.suggestion}` : item.original}
        </Text>
      ) : null}
      <Text style={styles.explanation}>{item.explanation}</Text>
    </View>
  );
}

/**
 * The secondary button that asks for a check. The count of checks left is the panel's to
 * say; the button only goes dim when none are.
 */
export function PrecheckButton({
  label,
  busy,
  disabled,
  error,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const off = disabled || busy;
  return (
    <View style={styles.buttonWrap}>
      <TouchableOpacity
        style={[styles.button, off && styles.buttonOff]}
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.accentBase} />
        ) : (
          <Text style={styles.buttonText}>{label}</Text>
        )}
      </TouchableOpacity>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    panel: {
      marginTop: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    title: { fontSize: 14, fontWeight: '500', color: colors.text },
    sub: { fontSize: 12, color: colors.neutral500, lineHeight: 17 },
    line: { fontSize: 14, color: colors.text, lineHeight: 20 },
    summary: { fontSize: 14, color: colors.text, lineHeight: 20 },
    left: { fontSize: 12, color: colors.neutral400 },
    readingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    readingChip: {
      fontSize: 12.5,
      color: colors.neutral400,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    readingChipOn: { color: colors.accent300, borderColor: colors.accentBase },
    passage: { gap: 6 },
    passageName: { fontSize: 12, fontWeight: '500', color: colors.neutral400 },
    words: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    word: {
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignItems: 'center',
    },
    wordText: { fontSize: 15, color: colors.text },
    wordScore: { fontSize: 10.5, color: colors.neutral500 },
    remark: {
      borderLeftWidth: 3,
      borderLeftColor: colors.neutral800,
      paddingLeft: 10,
      gap: 3,
    },
    remarkMajor: { borderLeftColor: colors.accentBase },
    kind: { fontSize: 11.5, fontWeight: '500', color: colors.neutral400 },
    fragment: { fontSize: 14, color: colors.text },
    explanation: { fontSize: 13.5, color: colors.neutral300, lineHeight: 19 },
    revisit: { gap: 8, marginTop: 4 },
    revisitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    revisitName: { flex: 1, gap: 2 },
    addButton: {
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.accentBase,
      minHeight: 40,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: { fontSize: 13.5, fontWeight: '500', color: colors.accentBase },
    buttonWrap: { gap: 6, marginTop: 12 },
    button: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accentBase,
      minHeight: 44,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonOff: { borderColor: colors.neutral800, opacity: 0.6 },
    buttonText: { fontSize: 15, fontWeight: '500', color: colors.accentBase },
    error: { fontSize: 13, color: colors.neutral400 },
  });
