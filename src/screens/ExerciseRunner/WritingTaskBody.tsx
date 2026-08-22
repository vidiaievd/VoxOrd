import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { getMediaAsset } from '../../api/media';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  appendPhrase,
  buildWritingTaskAnswer,
  formatClock,
  measure,
  readWritingTaskContent,
  submitGate,
  togglePoint,
  type WritingTaskContent,
} from './templates/writingTask';

/** The countdown turns amber here — five minutes left, the handoff's warning threshold. */
const TIMER_WARN_S = 300;

/**
 * `writing_task` body — the learner's side of a written task, over the plan 50 shape.
 *
 * The screen follows the handoff's order: what kind of text this is, the instruction, the
 * material this mode carries (a picture, a text to retell, a recipient), the prompt, the
 * checklist of points to cover, the phrases on offer, the field, and a readout of the
 * facts about what has been written so far.
 *
 * Nothing here grades. `writing_task` is never auto-scored — the submission goes to a
 * teacher's queue and comes back `requiresReview`, which the FeedbackBar already says.
 * The only judgement this component makes is whether the text is long enough to hand in,
 * and `submitGate` states it rather than leaving the Check button mysteriously grey.
 *
 * The teacher's mark, the rubric marks and the comment are **not** shown here: the mobile
 * app has no surface that reads a graded attempt back (plan 50 phase 7, «Отклонения»).
 * The rubric appears only as a writing guide, and only where the author asked for it with
 * `showRubric: 'always'` — that is the one case where the level descriptors are projected
 * before the mark.
 */
export function WritingTaskBody({ display, disabled, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const task = useMemo(() => readWritingTaskContent(display.content), [display.content]);

  if (task === null) {
    return <UnreadableTask onAnswerChange={onAnswerChange} />;
  }
  return (
    <WritingTask
      task={task}
      instruction={display.instructions?.[0]?.instructionText ?? task.instruction}
      disabled={disabled}
      onAnswerChange={onAnswerChange}
      t={t}
      colors={colors}
      styles={styles}
    />
  );
}

/**
 * What is shown when the content is not the student projection — an exercise still seeded
 * in the pre-plan-50 shape, or a server old enough to hand over the answer key.
 *
 * Refusing is the point (`readWritingTaskContent`): a body that guessed would put an
 * empty prompt on screen and let the learner write a text against nothing, and the
 * deployment problem behind it would stay invisible.
 */
function UnreadableTask({ onAnswerChange }: Pick<ExerciseBodyProps, 'onAnswerChange'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>{t('exerciseRunner.writingTaskUnavailable')}</Text>
      <Text style={styles.unavailableDesc}>{t('exerciseRunner.writingTaskUnavailableDesc')}</Text>
    </View>
  );
}

interface WritingTaskProps {
  task: WritingTaskContent;
  instruction: string;
  disabled: boolean;
  onAnswerChange: ExerciseBodyProps['onAnswerChange'];
  t: ReturnType<typeof useTranslation>['t'];
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}

function WritingTask({
  task,
  instruction,
  disabled,
  onAnswerChange,
  t,
  colors,
  styles,
}: WritingTaskProps) {
  const s = task.settings;
  const [text, setText] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [planOpen, setPlanOpen] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(s.timer * 60);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const gate = useMemo(() => submitGate(s, text), [s, text]);
  const { words: wordCount, length } = useMemo(() => measure(s, text), [s, text]);

  useEffect(() => {
    onAnswerChange(buildWritingTaskAnswer(text, ticked), gate.canSubmit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ticked, gate.canSubmit]);

  // The clock starts on the first keystroke and floors at 0:00. What happens when it
  // reaches zero is left undecided by the handoff, so nothing happens here either: taking
  // the work away at zero is a server rule, not one for this screen to invent.
  const hasText = text.trim() !== '';
  useEffect(() => {
    if (s.timer === 0 || disabled || !hasText) return;
    const id = setInterval(() => setSecondsLeft(left => Math.max(0, left - 1)), 1000);
    return () => clearInterval(id);
  }, [s.timer, disabled, hasText]);

  // The picture is an asset id on the wire; the URL is pre-signed with a one-hour TTL, so
  // it is resolved here, just in time, and never cached alongside the content.
  const assetId = task.image?.assetId;
  useEffect(() => {
    if (task.mode !== 'picture' || !assetId) return;
    let cancelled = false;
    getMediaAsset(assetId)
      .then(asset => {
        if (!cancelled) setImageUrl(asset.url);
      })
      .catch(() => {
        // A missing picture leaves the placeholder; the prompt and the points still
        // describe the task, and failing the whole exercise over it would be worse.
      });
    return () => {
      cancelled = true;
    };
  }, [task.mode, assetId]);

  const onTogglePoint = useCallback(
    (id: string) => {
      if (disabled) return;
      setTicked(prev => togglePoint(prev, id));
    },
    [disabled],
  );

  const onAppendPhrase = useCallback(
    (phrase: string) => {
      if (disabled) return;
      setText(prev => appendPhrase(prev, phrase));
    },
    [disabled],
  );

  const countColor =
    length === 'ok' ? colors.success : length === 'long' ? colors.danger : colors.textMuted;
  const meterMax = s.maxWords || s.minWords || 1;
  const meterWidth = Math.min(100, (wordCount / meterMax) * 100);

  return (
    <View>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{t(`exerciseRunner.writingTaskMode.${task.mode}`)}</Text>
      </View>

      {instruction ? <Text style={styles.instructions}>{instruction}</Text> : null}

      {task.mode === 'picture' ? (
        <View style={styles.figure}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={task.image?.alt || undefined}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>
                {t('exerciseRunner.writingTaskImageMissing')}
              </Text>
            </View>
          )}
          {task.image?.caption?.trim() ? (
            <Text style={styles.caption}>{task.image.caption}</Text>
          ) : null}
        </View>
      ) : null}

      {task.mode === 'retell' && task.source?.trim() ? (
        <Text style={styles.source}>{task.source}</Text>
      ) : null}

      <Text style={styles.prompt}>{task.prompt}</Text>

      {task.mode === 'letter' && task.letter?.recipient?.trim() ? (
        <Text style={styles.letterLine}>
          {t('exerciseRunner.writingTaskLetterLine', {
            recipient: task.letter.recipient,
            register: t(`exerciseRunner.writingTaskRegister.${task.letter.register}`),
          })}
        </Text>
      ) : null}

      {s.showPlan && task.points.length > 0 ? (
        <View style={styles.plan}>
          <TouchableOpacity
            style={styles.planHeader}
            onPress={() => setPlanOpen(open => !open)}
            accessibilityRole="button"
          >
            <Text style={styles.planTitle}>{t('exerciseRunner.writingTaskChecklist')}</Text>
            <Text style={styles.planCount}>
              {ticked.length}/{task.points.length}
            </Text>
            <Text style={styles.planChevron}>{planOpen ? '▴' : '▾'}</Text>
          </TouchableOpacity>

          {planOpen
            ? task.points.map(point => {
                const on = ticked.includes(point.id);
                return (
                  <TouchableOpacity
                    key={point.id}
                    style={styles.planRow}
                    onPress={() => onTogglePoint(point.id)}
                    disabled={disabled}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.planText}>{point.text}</Text>
                  </TouchableOpacity>
                );
              })
            : null}
        </View>
      ) : null}

      {/*
        The rubric as a writing guide, never as an explanation of a mark. It is here only
        when the author set `showRubric: 'always'` — that is the single case in which the
        server projects the level descriptors before a teacher has read the text.
      */}
      {task.rubric && task.rubric.length > 0 ? (
        <View style={styles.rubric}>
          <View style={styles.rubricHeader}>
            <Text style={styles.rubricTitle}>{t('exerciseRunner.writingTaskRubric')}</Text>
            <Text style={styles.rubricPass}>
              {t('exerciseRunner.writingTaskPassLine', {
                pass: s.passScore,
                max: task.rubricMax,
              })}
            </Text>
          </View>
          {task.rubric.map(criterion => (
            <View key={criterion.id} style={styles.criterion}>
              <Text style={styles.criterionName}>
                {criterion.name}
                {criterion.weight === 2 ? ' ×2' : ''}
              </Text>
              {criterion.desc.trim() !== '' ? (
                <Text style={styles.criterionDesc}>{criterion.desc}</Text>
              ) : null}
              {criterion.levels[3].trim() !== '' ? (
                <Text style={styles.criterionTop}>
                  {t('exerciseRunner.writingTaskTopLevel', { descriptor: criterion.levels[3] })}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {s.showPhrases && task.phrases.length > 0 ? (
        <View style={styles.phrases}>
          <Text style={styles.sectionTitle}>{t('exerciseRunner.writingTaskPhrases')}</Text>
          <View style={styles.phraseRow}>
            {task.phrases.map((phrase, i) => (
              <TouchableOpacity
                key={`${phrase}-${i}`}
                style={styles.phraseChip}
                onPress={() => onAppendPhrase(phrase)}
                disabled={disabled}
              >
                <Text style={styles.phraseChipText}>{phrase}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
        autoCapitalize="sentences"
        // React Native's TextInput has no paste event to cancel, so `blockPaste` takes the
        // paste entry away with the rest of the edit menu instead of intercepting it.
        contextMenuHidden={s.blockPaste}
        placeholder={t('exerciseRunner.writingTaskPlaceholder')}
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.readout}>
        {s.showWordCount ? (
          <View style={styles.countGroup}>
            <View style={styles.meterTrack}>
              <View
                style={[styles.meterFill, { width: `${meterWidth}%`, backgroundColor: countColor }]}
              />
            </View>
            <Text style={[styles.countText, { color: countColor }]}>
              {s.maxWords > 0
                ? t('exerciseRunner.writingTaskWordRange', {
                    count: wordCount,
                    min: s.minWords,
                    max: s.maxWords,
                  })
                : t('exerciseRunner.writingTaskWordRangeOpen', {
                    count: wordCount,
                    min: s.minWords,
                  })}
            </Text>
          </View>
        ) : null}

        {s.timer > 0 ? (
          <Text
            style={[
              styles.meta,
              secondsLeft < TIMER_WARN_S ? { color: colors.warning } : null,
            ]}
          >
            ⏱ {formatClock(secondsLeft)}
          </Text>
        ) : null}

        {s.blockPaste ? (
          <Text style={styles.meta}>{t('exerciseRunner.writingTaskPasteOff')}</Text>
        ) : null}
      </View>

      {/*
        Why the Check button is grey. The runner's footer is generic, so the reason for a
        blocked submission has to be said here or nowhere.
      */}
      {gate.block === 'short' ? (
        <Text style={styles.gateNote}>
          {t('exerciseRunner.writingTaskNeedMore', { count: gate.remaining })}
        </Text>
      ) : null}
      {gate.block === 'long' ? (
        <Text style={[styles.gateNote, { color: colors.danger }]}>
          {t('exerciseRunner.writingTaskTooLong', { max: s.maxWords })}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    badgeRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    badge: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textPrimary,
      backgroundColor: colors.accentLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: 'hidden',
    },
    instructions: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 14,
      lineHeight: 18,
    },
    figure: {
      marginBottom: 14,
    },
    image: {
      width: '100%',
      height: 180,
      borderRadius: 12,
    },
    imagePlaceholder: {
      height: 120,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePlaceholderText: {
      fontSize: 12.5,
      color: colors.textMuted,
    },
    caption: {
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 6,
    },
    source: {
      fontSize: 15,
      lineHeight: 24,
      color: colors.textPrimary,
      backgroundColor: colors.backgroundInput,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    prompt: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      lineHeight: 26,
    },
    letterLine: {
      fontSize: 12.5,
      color: colors.textMuted,
      marginBottom: 14,
    },
    plan: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      marginBottom: 14,
      overflow: 'hidden',
    },
    planHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.backgroundInput,
    },
    planTitle: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    planCount: {
      fontSize: 12.5,
      color: colors.textMuted,
    },
    planChevron: {
      fontSize: 12,
      color: colors.textMuted,
    },
    planRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxOn: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    checkboxMark: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textInverted,
    },
    planText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    rubric: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
      backgroundColor: colors.backgroundInput,
    },
    rubricHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    rubricTitle: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    rubricPass: {
      fontSize: 12.5,
      color: colors.textMuted,
    },
    criterion: {
      marginBottom: 8,
    },
    criterionName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    criterionDesc: {
      fontSize: 12.5,
      color: colors.textMuted,
      lineHeight: 17,
    },
    criterionTop: {
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 17,
    },
    phrases: {
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    phraseRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    phraseChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.backgroundInput,
    },
    phraseChipText: {
      fontSize: 12.5,
      color: colors.textPrimary,
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textPrimary,
      minHeight: 220,
      textAlignVertical: 'top',
    },
    readout: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    countGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    meterTrack: {
      width: 54,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    meterFill: {
      height: '100%',
      borderRadius: 999,
    },
    countText: {
      fontSize: 12,
    },
    meta: {
      fontSize: 12,
      color: colors.textMuted,
    },
    gateNote: {
      fontSize: 12.5,
      color: colors.textSecondary,
      marginTop: 8,
    },
    unavailable: {
      paddingVertical: 40,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    unavailableTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    unavailableDesc: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
