import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiError } from '../../api/client';
import { findOpenAttempt, type AnsweredQuestion } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import { ShortAnswerLegacyBody } from './ShortAnswerLegacyBody';
import {
  buildShortAnswerSubmission,
  canHandIn,
  countVerdict,
  EMPTY_TALLY,
  isShortAnswerDocument,
  readShortAnswerResult,
  readShortAnswerSet,
  readVerdict,
  type ShortAnswerAnswer,
  type ShortAnswerResult,
  type ShortAnswerSet as Set,
  type ShortAnswerTally,
  type ShortAnswerVerdict,
} from './templates/shortAnswer';

/**
 * `short_answer` — a set of open comprehension questions, answered one at a time.
 *
 * Two document shapes reach this body and the shape decides which one runs, exactly as on
 * the server (`ShortAnswerValidator`): a document with `questions[]` is the plan 51 form
 * and is played by `ShortAnswerSet` below, anything else is one of the 144 exercises still
 * written as a single question and goes to `ShortAnswerLegacyBody`, untouched. Dispatching
 * on the document rather than on a version field is deliberate — those 144 were written
 * before any version existed, so a field could only ever be absent there.
 */
export function ShortAnswerBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const set = useMemo(
    () => (isShortAnswerDocument(display.content) ? readShortAnswerSet(display.content) : null),
    [display.content],
  );

  if (!isShortAnswerDocument(display.content)) {
    return <ShortAnswerLegacyBody {...props} />;
  }
  if (set === null) {
    return <UnreadableSet onAnswerChange={onAnswerChange} />;
  }
  return <ShortAnswerSet {...props} set={set} />;
}

/**
 * What is shown when a new-form document is not the student projection — a server old
 * enough to hand the answer key over with the questions.
 *
 * Refusing is the point (`readShortAnswerSet`): the key here is the answer written in the
 * words the student is being asked to find, and a body that stripped it locally would
 * leave a runner that works, an exercise that is pointless, and nothing on any screen to
 * say the key was ever sent.
 */
function UnreadableSet({ onAnswerChange }: Pick<ExerciseBodyProps, 'onAnswerChange'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>{t('exerciseRunner.shortAnswer.unavailable')}</Text>
      <Text style={styles.unavailableDesc}>{t('exerciseRunner.shortAnswer.unavailableDesc')}</Text>
    </View>
  );
}

/** Where the runner is in one question — README "Screen 2", the state machine of the set. */
type Phase = 'writing' | 'submitted' | 'done';

/**
 * The student's side of the set: write, hand in for good, read the verdict, move on.
 *
 * It renders the question and it owns the text; it decides nothing about the outcome.
 * Every verdict on this screen was computed by the engine and arrived with the answer,
 * which is the whole point of the type — the phrases the answer is matched against are
 * the answer itself, so they never reach the device and neither does the grader that
 * reads them (plan 51 §3.2).
 *
 * How it meets the runner shell: each answer is a call onto the attempt
 * (`answerQuestion`), which opens that attempt on the first one; when the last question
 * is in, the aggregate goes up through `onAnswerChange` and the footer's Check closes the
 * attempt with it. The engine regrades every answer there from scratch — a verdict that
 * reached a client is a verdict a client could send back (plan 51 §3.3).
 *
 * **The student sees only the input field** — no word counter, no sentence starter, no
 * hint, no timer. That is the handoff's decision, stated in as many words: `minWords`
 * exists and the too-short line exists, but showing the count would turn a question about
 * understanding into a question about length.
 */
function ShortAnswerSet({
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
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>('writing');
  const [result, setResult] = useState<ShortAnswerResult | null>(null);
  const [tally, setTally] = useState<ShortAnswerTally>(EMPTY_TALLY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True until the server has been asked what is already in — see the effect below. */
  const [resuming, setResuming] = useState(true);

  /** Every answer handed in, in order — what the closing aggregate carries. */
  const answers = useRef<ShortAnswerAnswer[]>([]);

  const total = set.questions.length;
  const question = set.questions[index];
  const last = index + 1 >= total;

  /**
   * Pick the set up where it was left (plan 51 §8 Q6).
   *
   * An answer is handed in for good, and the attempt stays open until the set is closed,
   * so an app killed mid-set leaves questions the engine considers answered. Walking
   * from the top would mean pressing `Lever svaret` on a question it refuses — and the
   * answers already in would never reach the closing aggregate.
   *
   * The attempt is read, never started: opening an exercise and leaving must still
   * create nothing. Nothing open, or nothing answered, and the set plays from the top.
   * Answers to questions the set no longer holds are dropped — a key can be edited
   * between sittings.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const open = await findOpenAttempt(display.id);
      if (cancelled) return;

      const known = (open?.answeredQuestions ?? []).filter((a: AnsweredQuestion) =>
        set.questions.some(q => q.id === a.questionId),
      );
      if (known.length > 0) {
        answers.current = known.map(({ questionId, text }) => ({ questionId, text }));
        setTally(
          known.reduce((counts, a) => {
            const verdict = readVerdict(a.verdict);
            return verdict === null ? counts : countVerdict(counts, verdict);
          }, EMPTY_TALLY),
        );

        const handedIn = known.map(a => a.questionId);
        const nextIndex = set.questions.findIndex(q => !handedIn.includes(q.id));
        if (nextIndex === -1) {
          // Every question is in and the attempt was never closed: the footer's Check is
          // all that is left, so the set arrives on its own completion screen.
          setIndex(total - 1);
          setPhase('done');
          onAnswerChange(buildShortAnswerSubmission(answers.current), true);
        } else {
          setIndex(nextIndex);
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

  // Nothing to check until the last answer is in: the footer's button closes the set, and
  // it must not be able to close one that is still being written.
  useEffect(() => {
    if (phase !== 'done') onAnswerChange(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const handIn = useCallback(async () => {
    if (!question || sending || !canHandIn(value)) return;
    setSending(true);
    setError(null);
    try {
      const response = await answerQuestion(question.id, { text: value.trim() });
      answers.current = [...answers.current, { questionId: question.id, text: value.trim() }];
      const read = readShortAnswerResult(response.result);
      setResult(read);
      // A verdict that could not be read is not counted as any of the three: the answer is
      // in, and the card says so with the `wait` chip rather than inventing an outcome.
      if (read) setTally(counts => countVerdict(counts, read.verdict));
      setPhase('submitted');
    } catch (e) {
      // A refusal the engine will keep making (this question is already in, the attempt is
      // closed) reads the same to the learner as a lost connection — but only one of them
      // is worth pressing the button again for, so they are told apart.
      setError(
        e instanceof ApiError && e.status === 422
          ? t('exerciseRunner.shortAnswer.handedInAlready')
          : t('exerciseRunner.shortAnswer.sendFailed'),
      );
    } finally {
      setSending(false);
    }
  }, [answerQuestion, question, sending, t, value]);

  const next = useCallback(() => {
    setResult(null);
    setValue('');
    setError(null);

    if (!last) {
      setIndex(i => i + 1);
      setPhase('writing');
      return;
    }
    // The set is written; the shell closes it. The verdicts collected along the way are
    // deliberately not sent — the validator recomputes all of them from the text and the
    // current key, which is what keeps the score, the routing and the teacher's breakdown
    // independent of anything this device decided.
    setPhase('done');
    onAnswerChange(buildShortAnswerSubmission(answers.current), true);
  }, [last, onAnswerChange]);

  if (resuming) {
    return (
      <View style={styles.unavailable}>
        <ActivityIndicator />
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableTitle}>{t('exerciseRunner.shortAnswer.empty')}</Text>
      </View>
    );
  }

  if (phase === 'done') {
    const withTeacher = set.settings.teacherReview !== 'none';
    return (
      <View style={styles.done}>
        <Text style={styles.doneEmoji}>{withTeacher ? '📮' : '✓'}</Text>
        <Text style={styles.doneTitle}>{t('exerciseRunner.shortAnswer.doneTitle')}</Text>
        <Text style={styles.doneTally}>{t('exerciseRunner.shortAnswer.doneTally', {
            pass: tally.pass,
            partial: tally.partial,
            fail: tally.fail,
          })}</Text>
        {withTeacher ? (
          <Text style={styles.doneNote}>{t('exerciseRunner.shortAnswer.doneTeacher')}</Text>
        ) : null}
        {/* The set is handed in by the footer, which is the one button that closes an
            attempt in this app. Said out loud, because the screen is otherwise finished
            and nothing on it would explain what is left to press. */}
        {!disabled ? (
          <Text style={styles.doneHint}>{t('exerciseRunner.shortAnswer.doneHint')}</Text>
        ) : null}
      </View>
    );
  }

  if (!question) return null;

  const submitted = phase === 'submitted';
  const verdict: ShortAnswerVerdict | 'wait' = result?.verdict ?? 'wait';
  const toneColor = verdictColor(verdict, colors);
  // The bar counts the question being answered as done the moment it is handed in, so the
  // last answer fills it rather than leaving the set looking unfinished.
  const filled = (index + (submitted ? 1 : 0)) / total;

  return (
    <View>
      {set.settings.progress ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${filled * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {t('exerciseRunner.shortAnswer.position', { n: index + 1, total })}
          </Text>
        </View>
      ) : null}

      {/* The reader's own instruction wins where there is one: it is translated per
          learner, while the projection carries the author's, in the language being
          learned. One or the other, never both above every question (plan 51 §5). */}
      {instructionOf(display, set) ? (
        <Text style={styles.instruction}>{instructionOf(display, set)}</Text>
      ) : null}

      {/* `reading` only. A `listening` transcript is the author's own and the projection
          never sends it; an `opinion` question has no passage to send. */}
      {question.passage ? <Text style={styles.passage}>{question.passage}</Text> : null}

      <Text style={styles.prompt}>{question.prompt}</Text>

      <TextInput
        style={[
          styles.input,
          { borderColor: submitted ? toneColor : value.trim() ? colors.accent : colors.border },
          submitted && styles.inputSubmitted,
        ]}
        value={value}
        onChangeText={setValue}
        // Read-only rather than disabled once handed in: the answer stays selectable and
        // stays readable to assistive technology.
        editable={!submitted && !disabled && !sending}
        multiline
        autoCapitalize="sentences"
        placeholder={t('exerciseRunner.shortAnswer.placeholder')}
        placeholderTextColor={colors.textMuted}
      />

      {submitted ? (
        <View style={[styles.card, { borderColor: toneColor }]}>
          <View style={styles.cardHead}>
            {/* Icon and word, never colour alone. */}
            <Text style={[styles.chip, { color: toneColor, backgroundColor: `${toneColor}1A` }]}>
              {`${verdictMark(verdict)} ${t(`exerciseRunner.shortAnswer.verdict.${verdict}`)}`}
            </Text>
            {result ? (
              <Text style={styles.covered}>
                {t('exerciseRunner.shortAnswer.covered', {
                  covered: result.covered,
                  total: result.total,
                })}
              </Text>
            ) : null}
          </View>

          {result?.tooShort ? (
            <Text style={styles.tooShort}>⚠ {t('exerciseRunner.shortAnswer.tooShort')}</Text>
          ) : null}

          {/* Which of the things the answer had to say were said — the teacher's labels,
              never the anchor phrases. The server drops those before answering, so they
              are not here to leak. Empty when the author switched the breakdown off. */}
          {result?.hits.map(hit => (
            <Text
              key={hit.id}
              style={[styles.hit, { color: hit.hit ? colors.success : colors.textSecondary }]}
            >
              {hit.hit ? '✓' : '✗'} {hit.label}
            </Text>
          ))}

          {result?.why ? <Text style={styles.why}>{result.why}</Text> : null}

          {/* Under `showModel: 'never'` this is not hidden here — it never left the
              server (plan 51 §6.1). */}
          {result?.model ? (
            <Text style={styles.model}>
              <Text style={styles.modelLabel}>{t('exerciseRunner.shortAnswer.modelLabel')}: </Text>
              {result.model}
            </Text>
          ) : null}

          {set.settings.teacherReview !== 'none' ? (
            <Text style={styles.routing}>
              {set.settings.teacherReview === 'flagged' && result?.verdict === 'pass'
                ? t('exerciseRunner.shortAnswer.routingIfUnclear')
                : t('exerciseRunner.shortAnswer.routing')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {submitted ? (
        <TouchableOpacity style={styles.button} onPress={next}>
          <Text style={styles.buttonText}>
            {last ? t('exerciseRunner.shortAnswer.last') : t('exerciseRunner.shortAnswer.next')}
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.button, (!canHandIn(value) || sending) && styles.buttonDisabled]}
            onPress={handIn}
            disabled={!canHandIn(value) || sending || disabled}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textInverted} />
            ) : (
              <Text style={styles.buttonText}>{t('exerciseRunner.shortAnswer.handIn')}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.irreversible}>
            {t('exerciseRunner.shortAnswer.irreversible')}
          </Text>
        </>
      )}
    </View>
  );
}

/** `wait` is a handed-in answer whose verdict could not be read — not a fourth outcome. */
function verdictColor(verdict: ShortAnswerVerdict | 'wait', colors: ColorScheme): string {
  if (verdict === 'pass') return colors.success;
  if (verdict === 'partial') return colors.warning;
  if (verdict === 'fail') return colors.danger;
  return colors.textMuted;
}

function verdictMark(verdict: ShortAnswerVerdict | 'wait'): string {
  if (verdict === 'pass') return '✓';
  if (verdict === 'partial') return 'ⓘ';
  if (verdict === 'fail') return '✗';
  return '⏱';
}

function instructionOf(display: ExerciseBodyProps['display'], set: Set): string {
  return display.instructions?.[0]?.instructionText ?? set.instruction;
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
    passage: {
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
    prompt: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 14,
      lineHeight: 25,
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 14,
      borderWidth: 2,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.textPrimary,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    inputSubmitted: {
      color: colors.textSecondary,
    },
    card: {
      marginTop: 14,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 8,
    },
    chip: {
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: 'hidden',
      marginRight: 10,
    },
    covered: {
      fontSize: 12,
      color: colors.textMuted,
    },
    tooShort: {
      fontSize: 12.5,
      color: colors.warning,
      marginBottom: 6,
    },
    hit: {
      fontSize: 13.5,
      lineHeight: 20,
    },
    why: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginTop: 8,
    },
    model: {
      fontSize: 13.5,
      color: colors.textPrimary,
      lineHeight: 20,
      marginTop: 8,
      backgroundColor: colors.backgroundInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    modelLabel: {
      fontWeight: '700',
    },
    routing: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    error: {
      fontSize: 12.5,
      color: colors.danger,
      marginTop: 10,
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
    irreversible: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    done: {
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 16,
    },
    doneEmoji: {
      fontSize: 34,
      marginBottom: 10,
    },
    doneTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    doneTally: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    doneNote: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    doneHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 12,
    },
    unavailable: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
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
