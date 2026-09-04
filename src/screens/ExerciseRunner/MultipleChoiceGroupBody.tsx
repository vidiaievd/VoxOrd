import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiError } from '../../api/client';
import type { SubmitAttemptResponse } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import type { AudioTranscript as AudioTranscriptWords } from '../../api/exercises';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  isMultipleChoiceGroupDocument,
  keepOnRetry,
  readMultipleChoiceGroupTable,
  readMultipleChoiceGroupVerdict,
  unansweredCount,
  type MultipleChoiceGroupItemResult,
  type MultipleChoiceGroupTable,
  type MultipleChoiceGroupVerdict,
} from './templates/multipleChoiceGroup';

/**
 * `multiple_choice_group` — a table of statements sharing one set of answer columns,
 * answered and checked as one block (plan 54).
 *
 * Two document shapes exist and the shape decides, exactly as on the server: a document
 * with `rows[]` is the plan 54 form and is played below; anything else is the old
 * `items[]` form, which was never playable on this device and falls through to the
 * unsupported-template placeholder as it did before.
 */
export function MultipleChoiceGroupBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const table = useMemo(
    () =>
      isMultipleChoiceGroupDocument(display.content)
        ? readMultipleChoiceGroupTable(display.content)
        : null,
    [display.content],
  );

  if (!isMultipleChoiceGroupDocument(display.content)) {
    return <UnreadableTable onAnswerChange={onAnswerChange} legacy />;
  }
  if (table === null) {
    return <UnreadableTable onAnswerChange={onAnswerChange} />;
  }
  return <MultipleChoiceGroupTableBody {...props} table={table} />;
}

/**
 * What is shown when there is nothing playable here — a document of the old form, or a
 * new one that arrived with its answer key still on it.
 *
 * Refusing the second is the point (`readMultipleChoiceGroupTable`). Stripping the key
 * here would leave a runner that works, a table whose retry and «Show the answers» are
 * decoration, and nothing on any screen to say the key had been sent (plan 54 §3.2).
 */
function UnreadableTable({
  onAnswerChange,
  legacy = false,
}: Pick<ExerciseBodyProps, 'onAnswerChange'> & { legacy?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>
        {t('exerciseRunner.multipleChoiceGroup.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {legacy
          ? t('exerciseRunner.multipleChoiceGroup.unavailableLegacyDesc')
          : t('exerciseRunner.multipleChoiceGroup.unavailableDesc')}
      </Text>
    </View>
  );
}

/**
 * Where the runner is — BEHAVIOR §6, the state machine of the table.
 *
 * `answering → checked`, and back again on a retry. The handoff's third name, `closed`, is
 * not a phase here but a field on the verdict: the server decides when the table is
 * finished, and it refuses a further check on one that is (plan 54 §3.3). The handoff's
 * fourth, `done`, belongs to the shell — see the note on the component.
 */
type Phase = 'answering' | 'checked';

/** The five states of an answer pill — README "Cell visual states". */
type CellState = 'default' | 'sel' | 'ok' | 'bad' | 'key';

/** The per-row result mark: right, wrong, or left unanswered. */
type RowMark = 'ok' | 'bad' | 'todo';

/**
 * The student's side of the table: answer every statement, hand the whole thing in, read
 * what comes back, fix the wrong ones and hand it in again.
 *
 * It renders the table and it owns nothing about the outcome. Which column is right, how
 * many checks are left, which rows are frozen and what order the statements are in all
 * came from the server, because the key never reaches the device (plan 54 §3.2, §3.5).
 * There is no branch in this file that could mark a row right before a check, and none
 * that could reveal the key early — there is nothing here that knows it.
 *
 * **The phone is always cards.** `settings.layout` is carried and ignored: a phone is the
 * case `auto` already resolves to (README, "Phone or `layout: 'cards'`"), and a table with
 * a column per answer does not fit one.
 *
 * How it meets the runner shell, and why this template meets it differently from the other
 * eight: a check is `checkTable`, which opens the attempt on the first one and submits the
 * whole table; a re-check is another submit onto that same attempt, which the engine
 * reopens against the author's `retry` budget. So the check that *closes* the table is
 * also the submit that closes the item, and it is reported to the shell through
 * `finishTable` rather than through a footer Check that no longer exists (plan 54 §8 Q6).
 * The handoff's `Fullfør` is then the shell's own Continue, and its `Gjør på nytt` the
 * shell's Try again — a fresh attempt, which is what that button has always meant here.
 */
function MultipleChoiceGroupTableBody({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  onOpenSourceLesson,
  table,
}: ExerciseBodyProps & { table: MultipleChoiceGroupTable }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  /** `rowId → columnId`. A row not in here is unanswered. */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('answering');
  const [verdict, setVerdict] = useState<MultipleChoiceGroupVerdict | null>(null);
  /**
   * Rows the server froze under `lockCorrect`, cumulative.
   *
   * Held apart from the verdict because it outlives it: a retry drops the marks and must
   * keep the freeze. The same shape of mistake that made `multiple_choice`'s 50/50 vanish
   * on «Try again» (plan 53 phase 4, finding 1).
   */
  const [locked, setLocked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The listening layer, if this table has one — plan 56 phase 7.
   *
   * There is no listen-first screen here even when the author asked for one: the table is
   * checked as a block and its material sits above it, so a `gate` layout is the same
   * player with the pills locked until the clip has been heard.
   */
  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;
  /** The clip's words, once the check that closed the table earned them (§3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(null);

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`), and the shell
  // must never think there is an answer of its own to submit: the table is handed in from
  // here, and a second submit on a closed table is a refusal.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  const { rows, columns, settings } = table;
  const total = rows.length;
  const remaining = unansweredCount(rows, answers);

  const checked = phase === 'checked' && verdict !== null;
  const closed = checked && verdict.closed;

  const outcomes = useMemo(() => {
    const map = new Map<string, MultipleChoiceGroupItemResult>();
    for (const item of verdict?.items ?? []) map.set(item.itemId, item);
    return map;
  }, [verdict]);

  /**
   * Hand the table in, or ask to be shown the key.
   *
   * The verdict decides everything that follows, including whether the table is over —
   * `closed` is the server's word, and a table that is closed with checks still unspent
   * («all right», «Show the answers») is exactly the case a counter kept here would get
   * wrong. When it closes, the shell is told, and this screen keeps rendering the closed
   * table beneath the verdict bar.
   */
  const send = useCallback(
    async (reveal: boolean) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const response: SubmitAttemptResponse = await checkTable(answers, reveal);
        const details = readMultipleChoiceGroupVerdict(response.details);
        if (details === null) {
          setError(t('exerciseRunner.multipleChoiceGroup.sendFailed'));
          return;
        }

        setVerdict(details);
        setLocked(details.locked);
        setPhase('checked');
        // The table is closed, so the clip has nothing left to give away and the engine
        // hands over what it said (plan 56 §3.3).
        if (response.audioTranscript) setTranscript(response.audioTranscript);
        if (details.closed) finishTable(response);
      } catch (e) {
        // A refusal the engine will keep making — this table is closed, the budget is
        // spent — reads the same to the learner as a lost request, but only one of them is
        // worth pressing the button again for.
        setError(
          e instanceof ApiError && e.status === 422
            ? t('exerciseRunner.multipleChoiceGroup.closedAlready')
            : t('exerciseRunner.multipleChoiceGroup.sendFailed'),
        );
      } finally {
        setSending(false);
      }
    },
    [answers, checkTable, finishTable, sending, t],
  );

  /**
   * Tap a pill. One column per row: the pick replaces whatever that row held.
   *
   * A frozen row is not editable, and neither is a table that has been checked — what
   * reopens it is «Try the wrong ones again», not a tap (R10).
   */
  const pick = useCallback(
    (rowId: string, columnId: string) => {
      // `audioLocked` joins the expression that was already here rather than adding a
      // second lock: two mechanisms are how the two drift apart (INTEGRATION.md).
      if (disabled || sending || audioLocked || phase !== 'answering' || locked.includes(rowId))
        return;
      setAnswers(current => ({ ...current, [rowId]: columnId }));
    },
    [disabled, sending, audioLocked, phase, locked],
  );

  /** «Try the wrong ones again» — R15. What survives is `keepOnRetry`; see it for why. */
  const retryWrong = useCallback(() => {
    setAnswers(current => keepOnRetry(current, locked, verdict?.items ?? []));
    setVerdict(null);
    setPhase('answering');
    setError(null);
  }, [locked, verdict]);

  if (total === 0) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t('exerciseRunner.multipleChoiceGroup.empty')}</Text>
        <Text style={styles.noticeDesc}>{t('exerciseRunner.multipleChoiceGroup.emptyDesc')}</Text>
      </View>
    );
  }

  /**
   * What this pill looks like right now.
   *
   * `key` is reachable only from the server's `keyColumnId`, which arrives only once the
   * table is closed and only when the author left the key visible. While a check is still
   * available the right column is not on this screen to be drawn.
   */
  function cellState(rowId: string, columnId: string): CellState {
    const picked = answers[rowId];
    const outcome = outcomes.get(rowId);

    if (checked && outcome !== undefined) {
      if (picked === columnId) return outcome.correct ? 'ok' : 'bad';
      if (outcome.keyColumnId === columnId) return 'key';
      return 'default';
    }
    return picked === columnId ? 'sel' : 'default';
  }

  function rowMark(rowId: string): RowMark | null {
    const outcome = outcomes.get(rowId);
    if (!checked || outcome === undefined) return null;
    if (outcome.correct) return 'ok';
    return outcome.submitted === null ? 'todo' : 'bad';
  }

  /** The explanation under a row, or nothing at all when the server sent neither field. */
  function explanationOf(rowId: string): MultipleChoiceGroupItemResult | null {
    const outcome = outcomes.get(rowId);
    if (!checked || outcome === undefined) return null;
    const hasWhy = (outcome.why ?? '').trim() !== '';
    const hasQuote = (outcome.quote ?? '').trim() !== '';
    return hasWhy || hasQuote ? outcome : null;
  }

  const answered = total - remaining;
  const passage = settings.showText && table.source.mode === 'inline' ? table.source.text : undefined;
  /**
   * «To the text» — the way back to the lesson the statements are about (README §Setup).
   *
   * Offered only when the screen that opened the runner said where that is: the document
   * carries no lesson id, because the builder never writes one (plan 54 Q5). A `link`
   * table opened from anywhere else still says nothing at all, label included — a heading
   * naming a lesson with no way to reach it is worse than no heading.
   */
  const backToText = table.source.mode === 'link' ? onOpenSourceLesson : undefined;
  const sourceLabel = table.source.label.trim();

  return (
    <View>
      {settings.progress && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${total === 0 ? 0 : (answered / total) * 100}%` }]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {t('exerciseRunner.multipleChoiceGroup.answered', { n: answered, total })}
          </Text>
        </View>
      )}

      {table.instruction.trim() !== '' && <Text style={styles.instruction}>{table.instruction}</Text>}

      {audioOn && (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audioLocked && (
            <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.statements')} />
          )}
        </View>
      )}

      {backToText !== undefined && (
        <TouchableOpacity
          style={styles.sourceLink}
          onPress={backToText}
          accessibilityRole="link"
          accessibilityLabel={
            sourceLabel === ''
              ? t('exerciseRunner.multipleChoiceGroup.toText')
              : `${t('exerciseRunner.multipleChoiceGroup.toText')}: ${sourceLabel}`
          }
        >
          <Text style={styles.sourceLinkText}>
            {sourceLabel === '' ? t('exerciseRunner.multipleChoiceGroup.toText') : sourceLabel} →
          </Text>
        </TouchableOpacity>
      )}

      {passage !== undefined && (
        <View style={styles.passage}>
          {table.source.label.trim() !== '' && (
            <Text style={styles.passageLabel}>{table.source.label}</Text>
          )}
          <Text style={styles.passageText}>{passage}</Text>
        </View>
      )}

      {checked && (
        <Summary
          verdict={verdict}
          closed={closed}
          passThreshold={settings.passThreshold}
          colors={colors}
          styles={styles}
        />
      )}

      {rows.map((row, i) => {
        const mark = rowMark(row.id);
        const outcome = explanationOf(row.id);
        const frozen = locked.includes(row.id);
        return (
          <View
            key={row.id}
            style={[
              styles.card,
              mark === 'ok' && { borderColor: colors.success },
              mark === 'bad' && { borderColor: colors.danger },
            ]}
          >
            <View style={styles.cardHead}>
              {settings.numbering && <Text style={styles.rowNumber}>{i + 1}.</Text>}
              <Text style={styles.rowText}>{row.text}</Text>
              {mark !== null && <RowIcon mark={mark} colors={colors} styles={styles} />}
            </View>

            <View
              style={styles.pills}
              accessibilityRole="radiogroup"
              accessibilityLabel={row.text}
            >
              {columns.map(column => {
                const state = cellState(row.id, column.id);
                const tone = cellTone(state, colors);
                const inert = disabled || sending || phase !== 'answering' || frozen;
                return (
                  <TouchableOpacity
                    key={column.id}
                    style={[
                      styles.pill,
                      state === 'key' ? styles.pillDashed : styles.pillSolid,
                      { borderColor: tone.border, backgroundColor: tone.bg },
                      inert && styles.pillInert,
                    ]}
                    onPress={() => pick(row.id, column.id)}
                    disabled={inert}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: answers[row.id] === column.id, disabled: inert }}
                    accessibilityLabel={`${row.text} — ${column.label}`}
                  >
                    {state === 'bad' && <Text style={[styles.pillMark, { color: tone.fg }]}>✗</Text>}
                    {(state === 'ok' || state === 'key' || state === 'sel') && (
                      <Text style={[styles.pillMark, { color: tone.fg }]}>✓</Text>
                    )}
                    <Text style={[styles.pillLabel, { color: tone.fg }]}>{column.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {outcome !== null && (
              <View style={styles.explanation}>
                {(outcome.why ?? '').trim() !== '' && (
                  <Text style={styles.explanationText}>{outcome.why}</Text>
                )}
                {(outcome.quote ?? '').trim() !== '' && (
                  <Text style={styles.quote}>«{outcome.quote}»</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {audioOn && (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      )}

      {/* The controls belong to the table, not to the shell's footer: for this template
          they are the check itself, and what they say depends on how the last check left
          the table (plan 54 §8 Q6). */}
      <View style={styles.actions}>
        {!checked && (
          <>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (remaining > 0 || disabled || sending || audioLocked) && styles.btnDim,
              ]}
              onPress={() => void send(false)}
              disabled={remaining > 0 || disabled || sending || audioLocked}
              accessibilityRole="button"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.textInverted} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {t('exerciseRunner.multipleChoiceGroup.check')}
                </Text>
              )}
            </TouchableOpacity>
            {remaining > 0 && (
              <Text style={styles.remaining}>
                {t('exerciseRunner.multipleChoiceGroup.remaining', { n: remaining })}
              </Text>
            )}
          </>
        )}

        {/* Drawn from the last verdict's `closed`, never from a count kept here: a table
            can close with checks to spare, and the engine refuses one either way. */}
        {checked && !closed && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, sending && styles.btnDim]}
              onPress={retryWrong}
              disabled={sending}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {t('exerciseRunner.multipleChoiceGroup.retryWrong')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ghostBtn, sending && styles.btnDim]}
              onPress={() => void send(true)}
              disabled={sending}
              accessibilityRole="button"
            >
              <Text style={styles.ghostBtnText}>
                {t('exerciseRunner.multipleChoiceGroup.showKey')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {checked && (
          <Text style={styles.attempt}>
            {t('exerciseRunner.multipleChoiceGroup.attempt', { n: verdict.attempt })}
          </Text>
        )}
        {closed && (
          <Text style={styles.closedHint}>{t('exerciseRunner.multipleChoiceGroup.doneHint')}</Text>
        )}
      </View>
    </View>
  );
}

/** ✓ / ✗ / ⚠ per row, so colour is never the only signal (README, accessibility). */
function RowIcon({
  mark,
  colors,
  styles,
}: {
  mark: RowMark;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (mark === 'ok') return <Text style={[styles.rowIcon, { color: colors.success }]}>✓</Text>;
  if (mark === 'bad') return <Text style={[styles.rowIcon, { color: colors.danger }]}>✗</Text>;
  return <Text style={[styles.rowIcon, { color: colors.textMuted }]}>⚠</Text>;
}

/**
 * The score card above the table — README "Feedback".
 *
 * The percentage is arithmetic over two numbers the server sent, not a judgement: the
 * engine counted the correct rows and this divides them by the total. `>=`, never `>`,
 * because that is what the kernel compares with and the handoff asks for it by name.
 */
function Summary({
  verdict,
  closed,
  passThreshold,
  colors,
  styles,
}: {
  verdict: MultipleChoiceGroupVerdict;
  closed: boolean;
  passThreshold: number;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  const { passedItems, totalItems } = verdict;
  const pct = totalItems === 0 ? 0 : Math.round((passedItems / totalItems) * 100);
  const passed = pct >= passThreshold;
  const wrong = totalItems - passedItems;

  const tone = !closed ? colors.accent : passed ? colors.success : colors.warning;

  return (
    <View style={[styles.summary, { borderLeftColor: tone }]}>
      <Text style={[styles.summaryScore, { color: tone }]}>
        {passedItems}/{totalItems}
      </Text>
      <View style={styles.summaryBody}>
        <Text style={styles.summaryHead}>
          {closed
            ? passed
              ? t('exerciseRunner.multipleChoiceGroup.passed')
              : t('exerciseRunner.multipleChoiceGroup.notPassed')
            : wrong > 0
              ? t('exerciseRunner.multipleChoiceGroup.wrongCount', { n: wrong })
              : t('exerciseRunner.multipleChoiceGroup.allRight')}
        </Text>
        <Text style={styles.summaryLine}>
          {closed
            ? t('exerciseRunner.multipleChoiceGroup.scoreLine', {
                pct,
                threshold: passThreshold,
              })
            : t('exerciseRunner.multipleChoiceGroup.lookAgain')}
        </Text>
      </View>
    </View>
  );
}

/** The colours of one pill state. `key` is hollow and dashed — shown, not chosen. */
function cellTone(
  state: CellState,
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
  if (state === 'key') {
    return { border: colors.success, bg: colors.backgroundCard, fg: colors.textPrimary };
  }
  return { border: colors.border, bg: colors.backgroundCard, fg: colors.textPrimary };
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    notice: {
      paddingVertical: 40,
      paddingHorizontal: 16,
      alignItems: 'center',
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
    audio: {
      marginBottom: 12,
    },
    instruction: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
      lineHeight: 21,
      marginBottom: 14,
    },
    passage: {
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      backgroundColor: colors.backgroundInput,
      borderTopRightRadius: 10,
      borderBottomRightRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 16,
    },
    sourceLink: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 16,
    },
    sourceLinkText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    passageLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 6,
    },
    passageText: {
      fontSize: 15,
      lineHeight: 24,
      color: colors.textSecondary,
    },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      borderLeftWidth: 3,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    summaryScore: {
      fontSize: 20,
      fontWeight: '800',
      marginRight: 12,
    },
    summaryBody: {
      flex: 1,
    },
    summaryHead: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    summaryLine: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    card: {
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    rowNumber: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      marginRight: 8,
      marginTop: 2,
    },
    rowText: {
      flex: 1,
      fontSize: 15.5,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    rowIcon: {
      fontSize: 16,
      fontWeight: '700',
      marginLeft: 8,
    },
    pills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      flexGrow: 1,
      flexBasis: 128,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    pillInert: {
      opacity: 0.75,
    },
    pillSolid: {
      borderStyle: 'solid',
    },
    // The key beside a wrong pick: hollow and dashed, because it is the answer being
    // shown rather than the answer being chosen.
    pillDashed: {
      borderStyle: 'dashed',
    },
    pillMark: {
      fontSize: 14,
      fontWeight: '700',
      marginRight: 6,
    },
    pillLabel: {
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    explanation: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    explanationText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    quote: {
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
      color: colors.textMuted,
      marginTop: 4,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
      marginTop: 10,
    },
    actions: {
      marginTop: 16,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    ghostBtn: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    ghostBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    btnDim: {
      opacity: 0.5,
    },
    remaining: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    attempt: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 10,
    },
    closedHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
  });
