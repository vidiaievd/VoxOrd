import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiError } from '../../api/client';
import { findOpenAttempt } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import { MultipleChoiceLegacyBody } from './MultipleChoiceLegacyBody';
import {
  buildMultipleChoiceSubmission,
  isMultipleChoiceDocument,
  optionLetter,
  readMultipleChoiceResult,
  readMultipleChoiceSet,
  resumeMultipleChoice,
  type MultipleChoiceResult,
  type MultipleChoiceSet as Set,
} from './templates/multipleChoice';

/**
 * `multiple_choice` — a set of questions, answered one at a time, each with its own budget
 * of tries.
 *
 * Two document shapes reach this body and the shape decides which one runs, exactly as on
 * the server (`MultipleChoiceValidator`): a document with `questions[]` is the plan 53
 * form and is played by `MultipleChoiceSet` below, anything else is one of the 121
 * exercises still written as a single question and goes to `MultipleChoiceLegacyBody`,
 * untouched. Dispatching on the document rather than on a version field is deliberate —
 * those 121 were written before any version existed, so a field could only ever be absent
 * there.
 */
export function MultipleChoiceBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  // Read once per document, not once per render: the set is what the resuming effect
  // below watches, and a fresh object every render would ask the server what is already
  // on the attempt every time anything on this screen changed.
  const set = useMemo(
    () => (isMultipleChoiceDocument(display.content) ? readMultipleChoiceSet(display.content) : null),
    [display.content],
  );

  if (!isMultipleChoiceDocument(display.content)) {
    return <MultipleChoiceLegacyBody {...props} />;
  }
  if (set === null) {
    return <UnreadableSet onAnswerChange={onAnswerChange} />;
  }
  return <MultipleChoiceSet {...props} set={set} />;
}

/**
 * What is shown when a new-form document is not the student projection — a server old
 * enough to hand the answer key over with the questions.
 *
 * Refusing is the point (`readMultipleChoiceSet`). Stripping the key here would leave a
 * runner that works, an exercise whose second try and 50/50 are decoration, and nothing
 * on any screen to say the key was ever sent (plan 53 §6.3).
 */
function UnreadableSet({ onAnswerChange }: Pick<ExerciseBodyProps, 'onAnswerChange'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{t('exerciseRunner.multipleChoice.unavailable')}</Text>
      <Text style={styles.noticeDesc}>{t('exerciseRunner.multipleChoice.unavailableDesc')}</Text>
    </View>
  );
}

/**
 * Where the runner is — README "Screen 2", the state machine of the set.
 *
 * `picking` and `judged` belong to the question, `done` to the set. The handoff's fourth
 * name, `closed`, is not a phase here but a field on the verdict: the server decides when
 * a question is finished, because that decision is the attempt budget and the budget is
 * the score (plan 53 §3.3).
 */
type Phase = 'picking' | 'judged' | 'done';

/** The six visual states of an option — README "Option visual states". */
type OptionState = 'default' | 'sel' | 'ok' | 'bad' | 'key' | 'gone';

/**
 * The student's side of the set: pick, hand the pick in, read what comes back, move on.
 *
 * It renders the question and it owns nothing about the outcome. Every verdict on this
 * screen came from the engine, and so did the order the options are in — a device that
 * knew which option was right would make the second try and the 50/50 into decoration,
 * which is the whole reason the key stays on the server (plan 53 §3.2, §3.4).
 *
 * How it meets the runner shell: each pick is a call onto the attempt (`answerQuestion`),
 * which opens that attempt on the first one; when the last question closes, the aggregate
 * goes up through `onAnswerChange` and the footer's Check closes the attempt with it. The
 * aggregate is empty on purpose — the engine rebuilds the list from the picks it recorded,
 * because which try a question was taken on *is* the score (plan 53 §5).
 */
function MultipleChoiceSet({
  display,
  disabled,
  onAnswerChange,
  answerQuestion,
  set,
}: ExerciseBodyProps & { set: Set }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('picking');
  const [result, setResult] = useState<MultipleChoiceResult | null>(null);
  /** Which try the open question is on. Held here because a retry clears the verdict. */
  const [attempt, setAttempt] = useState(1);
  /** What the 50/50 has taken away on the open question; survives «Prøv igjen». */
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True until the server has been asked what is already on the attempt. */
  const [resuming, setResuming] = useState(true);

  const settings = set.settings;
  const total = set.questions.length;
  const question = set.questions[index];
  const last = index + 1 >= total;

  /**
   * Pick the set up where it was left.
   *
   * The attempt is read, never started: opening an exercise and leaving must still create
   * nothing. Nothing open, or nothing picked, and the set plays from the top — which is
   * also what a failed read gives, since losing the network on the way in must not cost
   * the exercise.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const open = await findOpenAttempt(display.id);
      if (cancelled) return;

      const picks = open?.pickedOptions ?? [];
      if (picks.length > 0) {
        const from = resumeMultipleChoice(set, picks);
        setScore(from.score);
        setIndex(from.index);
        setAttempt(from.attempt);
        setEliminated(from.eliminated);
        if (from.allClosed) {
          // Every question is finished and the attempt was never closed: the footer's
          // Check is all that is left, so the set arrives on its own completion screen.
          setPhase('done');
          onAnswerChange(buildMultipleChoiceSubmission(), true);
        }
      }

      setResuming(false);
    })();

    return () => {
      cancelled = true;
    };
    // The set and the exercise are what this reads; the rest is written, not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.id, set]);

  // Nothing to check until the set is finished: the footer's button closes it, and it
  // must not be able to close a set that is still being answered.
  useEffect(() => {
    if (phase !== 'done') onAnswerChange(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  /**
   * Hand one pick in, or ask to be shown the answer.
   *
   * The verdict decides everything that follows, including whether the question is over:
   * `closed` is the server's word, not a count kept here. What is kept here is the running
   * score, and only because the completion card shows it before the set is submitted —
   * the score that counts is recomputed by the engine from the attempt.
   */
  const send = useCallback(
    async (optionId: string | null, reveal = false) => {
      if (!question || sending) return;
      setSending(true);
      setError(null);
      try {
        const response = await answerQuestion(question.id, { optionId, ...(reveal ? { reveal: true } : {}) });
        const verdict = readMultipleChoiceResult(response.result);
        if (verdict === null) {
          // The pick is in — it was the reply that could not be read. Saying so is better
          // than inventing a state: an invented `closed` would either strand the learner
          // on a finished question or offer a try the engine will refuse.
          setError(t('exerciseRunner.multipleChoice.sendFailed'));
          return;
        }
        setResult(verdict);
        setPicked(verdict.optionId === '' ? null : verdict.optionId);
        setAttempt(verdict.attempt);
        if (verdict.eliminated) setEliminated(verdict.eliminated);
        if (verdict.correct && verdict.attempt === 1) setScore(n => n + 1);
        setPhase('judged');
      } catch (e) {
        // A refusal the engine will keep making (this question is closed, the attempt is
        // over) reads the same to the learner as a lost connection — but only one of them
        // is worth pressing the button again for, so they are told apart.
        setError(
          e instanceof ApiError && e.status === 422
            ? t('exerciseRunner.multipleChoice.closedAlready')
            : t('exerciseRunner.multipleChoice.sendFailed'),
        );
      } finally {
        setSending(false);
      }
    },
    [answerQuestion, question, sending, t],
  );

  const judged = phase === 'judged' && result !== null;
  const closed = judged && result.closed;
  const wrongWithTriesLeft = judged && !result.correct && !result.closed;

  /**
   * Tap an option.
   *
   * Under `instant` the tap is the hand-in. Otherwise it only arms Check, and a tap while
   * a wrong pick is still open re-arms it: the judgement is dropped and the pick changes,
   * which is the handoff's "re-picking clears the judgement" rule. The try is not spent by
   * that — only «Prøv igjen» spends one.
   */
  const pick = (optionId: string) => {
    if (closed || disabled || sending) return;
    if (settings.instant) {
      setPicked(optionId);
      send(optionId);
      return;
    }
    if (judged) {
      setResult(null);
      setPhase('picking');
    }
    setPicked(optionId);
  };

  const retryQuestion = () => {
    setResult(null);
    setPicked(null);
    setAttempt(n => n + 1);
    setPhase('picking');
  };

  const next = () => {
    setResult(null);
    setPicked(null);
    setAttempt(1);
    setEliminated([]);
    setError(null);

    if (!last) {
      setIndex(i => i + 1);
      setPhase('picking');
      return;
    }
    // The set is answered; the shell closes it.
    setPhase('done');
    onAnswerChange(buildMultipleChoiceSubmission(), true);
  };

  if (resuming) {
    return (
      <View style={styles.notice}>
        <ActivityIndicator />
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t('exerciseRunner.multipleChoice.empty')}</Text>
        <Text style={styles.noticeDesc}>{t('exerciseRunner.multipleChoice.emptyDesc')}</Text>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={styles.done}>
        <Text style={styles.doneEmoji}>✓</Text>
        <Text style={styles.doneTitle}>{t('exerciseRunner.multipleChoice.doneTitle')}</Text>
        <Text style={styles.doneScore}>
          {t('exerciseRunner.multipleChoice.doneScore', { score, total })}
        </Text>
        {/* The set is handed in by the footer, which is the one button that closes an
            attempt in this app. Said out loud, because the screen is otherwise finished
            and nothing on it would explain what is left to press. */}
        {!disabled ? (
          <Text style={styles.doneHint}>{t('exerciseRunner.multipleChoice.doneHint')}</Text>
        ) : null}
      </View>
    );
  }

  if (!question) return null;

  /**
   * What this option looks like right now.
   *
   * The one rule worth stating: `key` is reachable only from `result.keyOptionId`, and the
   * server sends that only once the question is closed. There is no branch here that could
   * reveal the answer early, because there is nothing here that knows it.
   */
  const stateOf = (optionId: string): OptionState => {
    if (eliminated.includes(optionId)) return 'gone';
    if (!judged) return picked === optionId ? 'sel' : 'default';
    if (optionId === result.optionId && result.optionId !== '') {
      return result.correct ? 'ok' : 'bad';
    }
    if (optionId === result.keyOptionId) return 'key';
    return 'default';
  };

  // The bar counts the question as done the moment it closes, so the last one fills it
  // rather than leaving the set looking unfinished.
  const filled = (index + (closed ? 1 : 0)) / total;
  const instruction = display.instructions?.[0]?.instructionText ?? set.instruction;

  return (
    <View>
      {settings.progress ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${filled * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {t('exerciseRunner.multipleChoice.position', { n: index + 1, total })}
          </Text>
        </View>
      ) : null}

      {/* The reader's own instruction wins where there is one: it is translated per
          learner, while the projection carries the author's, in the language being
          learned. One or the other, never both above every question (plan 53 §5). */}
      {instruction.trim() !== '' ? <Text style={styles.instruction}>{instruction}</Text> : null}

      {/* `grammar`, `vocab`, `reading`. A `listening` transcript is the author's own and
          the projection never sends it (plan 53 §3.8). */}
      {question.context ? <Text style={styles.context}>{question.context}</Text> : null}

      <Text style={styles.stem}>{question.stem}</Text>

      {/* Always a list. The handoff offers a two-column `grid` on wide screens and
          collapses it under 560px — which is every phone, so `settings.layout` has
          nothing to change here. */}
      <View>
        {question.options.map((option, i) => {
          const state = stateOf(option.id);
          const tone = toneFor(state, colors);
          const gone = state === 'gone';

          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.option,
                {
                  borderColor: tone.border,
                  backgroundColor: tone.bg,
                },
                state === 'key' && styles.optionRevealed,
                gone && styles.optionGone,
              ]}
              onPress={() => pick(option.id)}
              disabled={gone || closed || disabled || sending}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{
                selected: picked === option.id,
                disabled: gone || closed || disabled,
              }}
            >
              {settings.letters ? (
                <Text
                  style={[
                    styles.letter,
                    {
                      borderColor: tone.border,
                      backgroundColor: state === 'sel' ? tone.border : colors.backgroundInput,
                      color: state === 'sel' ? colors.textInverted : tone.fg,
                    },
                  ]}
                >
                  {optionLetter(i)}
                </Text>
              ) : (
                <View
                  style={[
                    styles.bullet,
                    { borderColor: tone.border },
                    state === 'sel' && styles.bulletFilled,
                  ]}
                />
              )}
              {/* Colour is never the only signal: an eliminated option is struck through
                  as well as dimmed, and a judged one carries its own mark. */}
              <Text style={[styles.optionText, gone && styles.optionTextGone]}>{option.text}</Text>
              {state === 'ok' || state === 'key' ? (
                <Text style={[styles.mark, { color: colors.success }]}>✓</Text>
              ) : null}
              {state === 'bad' ? (
                <Text style={[styles.mark, { color: colors.danger }]}>✗</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {judged ? <Feedback result={result} colors={colors} /> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!judged && !settings.instant ? (
        <TouchableOpacity
          style={[styles.button, (picked === null || sending) && styles.buttonDisabled]}
          onPress={() => send(picked)}
          disabled={picked === null || sending || disabled}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.textInverted} />
          ) : (
            <Text style={styles.buttonText}>{t('exerciseRunner.multipleChoice.check')}</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {!judged && settings.instant ? (
        <Text style={styles.tapHint}>{t('exerciseRunner.multipleChoice.tapAnswer')}</Text>
      ) : null}

      {wrongWithTriesLeft ? (
        <>
          <TouchableOpacity
            style={[styles.button, sending && styles.buttonDisabled]}
            onPress={retryQuestion}
            disabled={sending || disabled}
          >
            <Text style={styles.buttonText}>{t('exerciseRunner.multipleChoice.tryAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondary, sending && styles.buttonDisabled]}
            onPress={() => send(null, true)}
            disabled={sending || disabled}
          >
            <Text style={styles.secondaryText}>
              {t('exerciseRunner.multipleChoice.showAnswer')}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}

      {closed ? (
        <TouchableOpacity style={styles.button} onPress={next}>
          <Text style={styles.buttonText}>
            {last
              ? t('exerciseRunner.multipleChoice.finish')
              : t('exerciseRunner.multipleChoice.next')}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* The counter belongs to the verdict: it says which try was just judged, and it
          goes away with «Prøv igjen» along with everything else that was judged. */}
      {judged ? (
        <Text style={styles.attempt}>
          {t('exerciseRunner.multipleChoice.attempt', { n: attempt })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The block under the options — README "Feedback block".
 *
 * What it can say is decided entirely by what the server sent. `why` arrives only with a
 * closed question; `optionWhy` only when the author asked for rebuttals and wrote one for
 * the option that was picked. Neither is defaulted here: the generic line stands in when a
 * wrong pick has nothing written against it, and nothing stands in for a rule that was
 * withheld — a rule not sent is a question not finished.
 */
function Feedback({ result, colors }: { result: MultipleChoiceResult; colors: ColorScheme }) {
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  const tone = result.correct ? colors.success : result.closed ? colors.accent : colors.danger;
  const mark = result.correct ? '✓' : result.closed ? 'ⓘ' : '✗';
  const generic = !result.correct && !result.optionWhy && !result.why;

  return (
    <View style={[styles.feedback, { borderColor: tone, backgroundColor: `${tone}14` }]}>
      <Text style={[styles.feedbackMark, { color: tone }]}>{mark}</Text>
      <View style={styles.feedbackBody}>
        {result.correct ? (
          <Text style={[styles.feedbackTitle, { color: tone }]}>
            {t('exerciseRunner.multipleChoice.right')}
          </Text>
        ) : null}
        {result.optionWhy ? <Text style={styles.feedbackText}>{result.optionWhy}</Text> : null}
        {generic ? (
          <Text style={styles.feedbackText}>{t('exerciseRunner.multipleChoice.generic')}</Text>
        ) : null}
        {result.why ? <Text style={styles.feedbackText}>{result.why}</Text> : null}
      </View>
    </View>
  );
}

/** README "Option visual states", on the phone's palette. */
function toneFor(
  state: OptionState,
  colors: ColorScheme,
): { border: string; bg: string; fg: string } {
  if (state === 'sel') {
    return { border: colors.accent, bg: colors.accentLight, fg: colors.textPrimary };
  }
  if (state === 'ok') {
    return { border: colors.success, bg: 'rgba(52, 199, 89, 0.12)', fg: colors.textPrimary };
  }
  if (state === 'bad') {
    return { border: colors.danger, bg: 'rgba(255, 59, 48, 0.10)', fg: colors.textPrimary };
  }
  // The key, shown beside a wrong pick. Outlined rather than filled: it is the answer
  // being shown, not the answer being chosen.
  if (state === 'key') {
    return { border: colors.success, bg: colors.backgroundCard, fg: colors.textPrimary };
  }
  return { border: colors.border, bg: colors.backgroundCard, fg: colors.textPrimary };
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginRight: 10,
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    instruction: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 19,
    },
    context: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      backgroundColor: colors.backgroundInput,
      borderRadius: 8,
    },
    stem: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
      lineHeight: 26,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderWidth: 2,
    },
    letter: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 1,
      textAlign: 'center',
      lineHeight: 24,
      fontSize: 11,
      fontWeight: '800',
      marginRight: 10,
      overflow: 'hidden',
    },
    bullet: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      marginRight: 10,
    },
    bulletFilled: {
      borderWidth: 6,
    },
    optionRevealed: {
      borderStyle: 'dashed',
    },
    optionGone: {
      opacity: 0.4,
    },
    optionText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 21,
    },
    optionTextGone: {
      textDecorationLine: 'line-through',
    },
    mark: {
      fontSize: 17,
      fontWeight: '700',
      marginLeft: 8,
    },
    feedback: {
      flexDirection: 'row',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 4,
      marginBottom: 4,
    },
    feedbackMark: {
      fontSize: 14,
      fontWeight: '800',
      marginRight: 8,
    },
    feedbackBody: {
      flex: 1,
    },
    feedbackTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      marginBottom: 2,
    },
    feedbackText: {
      fontSize: 13.5,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    error: {
      fontSize: 12.5,
      color: colors.danger,
      marginTop: 10,
    },
    tapHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 12,
      textAlign: 'center',
    },
    button: {
      marginTop: 14,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    secondary: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 11,
      alignItems: 'center',
    },
    secondaryText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    attempt: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 10,
    },
    done: {
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 16,
    },
    doneEmoji: {
      fontSize: 34,
      marginBottom: 10,
      color: colors.success,
    },
    doneTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    doneScore: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    doneHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 12,
    },
    notice: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
    },
    noticeTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    noticeDesc: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
