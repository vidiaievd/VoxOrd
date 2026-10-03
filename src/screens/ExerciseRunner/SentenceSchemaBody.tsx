import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiError } from '../../api/client';
import { findOpenAttempt, type CheckedRow } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import {
  AudioLockNote,
  AudioSegmentButton,
  AudioTranscript,
  ExerciseAudioPlayer,
} from './audio';
import type { AudioTranscript as AudioTranscriptWords } from '../../api/exercises';
import type { ExerciseBodyProps } from './ExerciseBody';
import { SchemaBoard, WordBank } from './SentenceSchemaBoard';
import {
  buildSentenceSchemaSubmission,
  canCheckRow,
  firstEmptyField,
  isSentenceSchemaDocument,
  keepCorrect,
  placeItem,
  placedItems,
  readSentenceSchemaResult,
  readSentenceSchemaSet,
  takeItem,
  type Placement,
  type SentenceSchemaBanner,
  type SentenceSchemaResult,
  type SentenceSchemaRow,
  type SentenceSchemaSet,
} from './templates/sentenceSchema';
import { deferPosition, nextPosition, type SetStep } from './templates/sentenceSetOrder';

/**
 * `sentence_schema` — a set of sentences laid out on a topological field board, played a
 * sentence at a time (plan 52).
 *
 * Every mark on this screen came from the engine. Which field a piece belongs in is the
 * answer key, and the note under the board is resolved from the key too — the author's own
 * words for the piece that went wrong, or a code to render when they wrote none. So the
 * board goes up and the marks come down, and there is no grader on this side to disagree
 * with the one on the server (plan 52 §3.2, §5).
 *
 * Unlike `short_answer`, whose answers are final, a sentence may be checked as often as
 * the learner likes: Check, then Fix keeping every piece that was right, then Check again.
 * What ends a sentence is solving it or asking to be shown it — and the second of those is
 * recorded on the attempt, not merely here, so force-quitting cannot turn a sentence that
 * was shown into one that can still be solved.
 *
 * A sentence can also be put aside once (`sentenceSetOrder`). The handoff has no answer
 * there, and without one a learner who cannot see how a sentence goes has exactly one way
 * forward: read the answer. Nothing is sent — an unanswered sentence is not a fact the
 * engine has an opinion about — so a set picked up in a later sitting is offered in its
 * plain order again.
 *
 * How it meets the runner shell: each check is a command onto the attempt (`checkRow`),
 * which opens that attempt on the first one; when the last sentence is closed, the
 * aggregate goes up through `onAnswerChange` and the footer's Check closes the attempt
 * with every board at once, which the engine regrades from scratch.
 */
export function SentenceSchemaBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const set = useMemo(
    () => (isSentenceSchemaDocument(display.content) ? readSentenceSchemaSet(display.content) : null),
    [display.content],
  );

  if (set === null) {
    return <UnreadableSet onAnswerChange={onAnswerChange} />;
  }
  return <SentenceSchemaSetBody {...props} set={set} />;
}

/**
 * What is shown when the document is not the student projection — a content-service or an
 * exercise-engine old enough to hand the answer key over with the sentences, or an
 * exercise still written in the pre-plan-52 shape.
 *
 * Refusing is the point (`readSentenceSchemaSet`). All seven seeded exercises were
 * rewritten (plan 52 §8 Q7), so there is no second form to fall back to, and a body that
 * stripped the key locally would leave a runner that works, an exercise that is pointless,
 * and nothing on any screen to say the key was ever sent.
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
      <Text style={styles.noticeTitle}>{t('exerciseRunner.sentenceSchema.unavailable')}</Text>
      <Text style={styles.noticeDesc}>{t('exerciseRunner.sentenceSchema.unavailableDesc')}</Text>
    </View>
  );
}

/**
 * Where the runner is in one sentence.
 *
 * `placing` and `checked` alternate for as long as the learner likes — being wrong is a
 * step, not a verdict. `closed` is the sentence solved or shown, and the board locks.
 */
type RowPhase = 'placing' | 'checked' | 'closed';

/** One sentence, as this runner is keeping track of it. */
interface RowState {
  placement: Placement;
  /** Which check this is, 1-based. Counted by the server, never here. */
  attempt: number;
  result: SentenceSchemaResult | null;
  phase: RowPhase;
  /**
   * How the sentence was closed, if it was.
   *
   * Kept apart from `result`, which a resumed sentence has none of: the engine hands back
   * the board and the outcome, never the marks that produced it, so a tally read off
   * `result` alone would count a sentence solved in an earlier sitting as neither.
   */
  solved: boolean;
  revealed: boolean;
}

function SentenceSchemaSetBody({
  display,
  disabled,
  onAnswerChange,
  checkRow,
  set,
}: ExerciseBodyProps & { set: SentenceSchemaSet }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [index, setIndex] = useState(0);
  /** Sentences put aside, oldest first, and the memory of every one ever put aside. */
  const [deferred, setDeferred] = useState<string[]>([]);
  const [everDeferred, setEverDeferred] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  /** The piece waiting for a field, and the field waiting for a piece. Never both. */
  const [armedItem, setArmedItem] = useState<string | null>(null);
  const [armedField, setArmedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True until the server has been asked what is already on this exercise. */
  const [resuming, setResuming] = useState(true);
  /**
   * The listening layer, if this set has one — plan 56 phase 7. One engine for the set,
   * because the allowance and the gate belong to the exercise and not to a sentence.
   * No listen-first screen: a sentence board is not something to enter, and `gate` is
   * served by holding the board read-only until the clip has been heard.
   */
  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  /** The clip's words, once the check that closed the last sentence earned them (§3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(null);

  const total = set.rows.length;

  /**
   * Put the set back where it was left.
   *
   * A sentence checked here is checked on the server, and the attempt stays open until the
   * set is closed — so an app killed mid-set leaves sentences the engine considers
   * finished, and walking from the top would mean checking one it refuses. The attempt is
   * read, never started: opening an exercise and leaving must still create nothing.
   *
   * Sentences the document no longer has are dropped rather than restored: a key can be
   * edited between sittings, and a board belonging to a sentence that is gone has nowhere
   * to go. `revealed` decides the phase alongside `solved` — a sentence that was shown is
   * closed even though nothing about it was ever right.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const open = await findOpenAttempt(display.id);
      if (cancelled) return;

      const checked: CheckedRow[] = (open?.checkedRows ?? []).filter((row) =>
        set.rows.some((r) => r.id === row.rowId),
      );

      const state: Record<string, RowState> = {};
      for (const row of set.rows) {
        const was = checked.find((r) => r.rowId === row.id);
        state[row.id] = {
          placement: was?.placement ?? row.start,
          attempt: Math.max(1, was?.attempts ?? 1),
          result: null,
          phase: was?.solved === true || was?.revealed === true ? 'closed' : 'placing',
          solved: was?.solved === true,
          revealed: was?.revealed === true,
        };
      }
      setRows(state);

      const open_ = set.rows.findIndex((row) => state[row.id]?.phase !== 'closed');
      if (open_ === -1 && checked.length > 0) {
        // Every sentence is finished and the attempt was never closed: the footer's Check
        // is all that is left, so the set arrives on its own completion card.
        setIndex(Math.max(0, total - 1));
        setDone(true);
        onAnswerChange(buildSentenceSchemaSubmission(submissionRows(set, state)), true);
      } else {
        setIndex(open_ === -1 ? 0 : open_);
      }

      setResuming(false);
    })();

    return () => {
      cancelled = true;
    };
    // The set and the exercise are what this reads; the rest it writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.id, set]);

  // Nothing to check until the set is closed: the footer's button hands the whole set in,
  // and it must not be able to hand in one still being solved.
  useEffect(() => {
    if (!done) onAnswerChange(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, index]);

  const row: SentenceSchemaRow | undefined = set.rows[Math.min(index, Math.max(0, total - 1))];
  const state: RowState = (row && rows[row.id]) || {
    placement: row?.start ?? {},
    attempt: 1,
    result: null,
    phase: 'placing',
    solved: false,
    revealed: false,
  };

  const update = useCallback((rowId: string, patch: Partial<RowState>) => {
    setRows((current) => {
      const before = current[rowId];
      if (!before) return current;
      return { ...current, [rowId]: { ...before, ...patch } };
    });
  }, []);

  /** Send the board up. `reveal` closes the sentence with the answer shown instead. */
  const send = useCallback(
    async (reveal: boolean) => {
      if (!row || sending) return;
      setSending(true);
      setError(null);
      try {
        const response = await checkRow(row.id, state.placement, reveal);
        const marks = readSentenceSchemaResult(response.result);
        // The set is closed, so the clip has nothing left to give away and the engine
        // hands over what it said (plan 56 §3.3).
        if (response.audioTranscript) setTranscript(response.audioTranscript);
        update(row.id, {
          result: marks,
          attempt: marks?.attempt ?? state.attempt,
          phase: reveal || marks?.solved === true ? 'closed' : 'checked',
          solved: marks?.solved === true,
          revealed: reveal,
          // A reveal fills the board in with the answer it just showed.
          ...(marks?.solution ? { placement: marks.solution } : {}),
        });
      } catch (e) {
        // A refusal the engine will keep making (this sentence is already closed) reads
        // the same to the learner as a lost connection, but only one of them is worth
        // pressing the button again for.
        setError(
          e instanceof ApiError && e.status === 422
            ? t('exerciseRunner.sentenceSchema.closedAlready')
            : t('exerciseRunner.sentenceSchema.checkFailed'),
        );
      } finally {
        setSending(false);
      }
    },
    [checkRow, row, sending, state.attempt, state.placement, t, update],
  );

  /** Any placement drops the marks: they were about the board as it was. */
  const place = useCallback(
    (placement: Placement) => {
      if (!row) return;
      update(row.id, {
        placement,
        ...(state.phase === 'checked' ? { result: null, phase: 'placing' as const } : {}),
      });
    },
    [row, state.phase, update],
  );

  /** Fix: keep what was right, clear the rest. The attempt counts up on the server. */
  const fix = useCallback(() => {
    if (!row || state.result === null) return;
    update(row.id, {
      placement: keepCorrect(state.placement, state.result),
      result: null,
      phase: 'placing',
    });
  }, [row, state.placement, state.result, update]);

  /**
   * Tapping a piece.
   *
   * An unaimed tap **places** rather than selects, which is how `word_bank_gap_fill` has
   * worked since plan 35 and how the web runner has worked since plan 52's phase 4: the
   * piece goes to the armed field, or to the first empty one, and the aim moves on to the
   * next empty field so a run of taps fills the board in order. The handoff's table says a
   * bare tap only selects — but on a phone, where tapping is the whole of the interaction
   * and there is no drag to fall back on, aiming twice for every piece is aiming at what
   * the board makes obvious anyway. In a sequence-only set it is the entire gesture: tap
   * the words in order and the sentence assembles.
   *
   * Precision is not lost. Tapping a field first still arms it, and once every field holds
   * something a tap goes back to selecting — which is what lets a second piece be added
   * beside the first.
   */
  function pressItem(itemId: string) {
    if (!row || locked) return;

    // The piece is on the board: tapping it in the bank is how it comes back.
    if (used.includes(itemId)) {
      place(takeItem(state.placement, itemId));
      return;
    }
    if (armedField !== null) {
      place(placeItem(state.placement, armedField, itemId));
      setArmedItem(null);
      setArmedField(null);
      return;
    }

    const single = row.fields.length === 1;
    const target = single ? (row.fields[0]?.id ?? null) : firstEmptyField(row.fields, state.placement);
    if (target === null) {
      setArmedItem(armedItem === itemId ? null : itemId);
      return;
    }

    const next = placeItem(state.placement, target, itemId);
    place(next);
    setArmedItem(null);
    // Point at where the next tap will land. One slot needs no pointing: there is nowhere
    // else a piece could go.
    setArmedField(single ? null : firstEmptyField(row.fields, next));
  }

  function pressField(fieldId: string) {
    if (locked) return;
    if (armedItem !== null) {
      place(placeItem(state.placement, fieldId, armedItem));
      setArmedItem(null);
      setArmedField(null);
      return;
    }
    setArmedField(armedField === fieldId ? null : fieldId);
  }

  const position = {
    ids: set.rows.map((r) => r.id),
    index,
    isClosed: (rowId: string) => rows[rowId]?.phase === 'closed',
    deferred,
  };

  /** Where the set goes from here — forward, then back to what was put aside, then done. */
  const move = useCallback(
    (step: SetStep) => {
      setDeferred(step.deferred);
      setError(null);
      setArmedItem(null);
      setArmedField(null);
      if (step.index === null) {
        setDone(true);
        onAnswerChange(buildSentenceSchemaSubmission(submissionRows(set, rows)), true);
        return;
      }
      setIndex(step.index);
    },
    [onAnswerChange, rows, set],
  );

  /** Put this one aside. Nothing is sent: an unanswered sentence has nothing to report. */
  function skip() {
    if (!row) return;
    // The memory is read as it was *before* this refusal and written after. Passing the
    // updated list would have the sentence tell `deferPosition` it had already been round
    // once — so the first skip would be treated as the second and queue nothing.
    move(deferPosition(position, everDeferred));
    if (!everDeferred.includes(row.id)) setEverDeferred([...everDeferred, row.id]);
  }

  if (resuming) {
    return (
      <View style={styles.notice}>
        <ActivityIndicator />
      </View>
    );
  }

  if (total === 0) {
    // Not an error — an exercise whose author has not finished a sentence yet.
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t('exerciseRunner.sentenceSchema.nothingToSolve')}</Text>
      </View>
    );
  }

  if (done) {
    const tally = {
      solved: set.rows.filter((r) => rows[r.id]?.solved === true).length,
      revealed: set.rows.filter((r) => rows[r.id]?.revealed === true).length,
      skipped: set.rows.filter(
        (r) => rows[r.id]?.phase !== 'closed' && everDeferred.includes(r.id),
      ).length,
    };
    return (
      <View style={styles.done}>
        <Text style={styles.doneEmoji}>✓</Text>
        <Text style={styles.doneTitle}>
          {t('exerciseRunner.sentenceSchema.setDone', { count: total })}
        </Text>
        <Text style={styles.doneTally}>
          {tally.skipped > 0
            ? t('exerciseRunner.sentenceSchema.setTallySkipped', tally)
            : t('exerciseRunner.sentenceSchema.setTally', tally)}
        </Text>
        {/* The set is handed in by the footer, which is the one button that closes an
            attempt in this app. Said out loud, because the screen is otherwise finished
            and nothing on it would explain what is left to press. */}
        {!disabled ? (
          <Text style={styles.doneHint}>{t('exerciseRunner.sentenceSchema.doneHint')}</Text>
        ) : null}
      </View>
    );
  }

  if (!row) return null;

  // The gate joins the expression that was already here rather than adding a second lock:
  // it reaches the board, the bank and every control the type owns (INTEGRATION.md).
  const locked = state.phase === 'closed' || disabled || (audioOn && audio.gated);
  const used = placedItems(state.placement);
  const textOf = (itemId: string) => row.bank.find((item) => item.id === itemId)?.text ?? '';
  const marks =
    state.result !== null && (state.phase === 'checked' || state.result.solved)
      ? { byItem: state.result.byItem, byField: state.result.byField }
      : null;
  const banner = state.phase === 'placing' ? null : (state.result?.banner ?? null);
  const solved = state.result?.solved === true;
  const lastSentence = nextPosition(position).index === null;
  const instruction =
    display.instructions?.[0]?.instructionText ??
    (set.instruction !== '' ? set.instruction : t('exerciseRunner.sentenceSchema.defaultInstruction'));

  const bannerTone = solved ? colors.success : state.revealed ? colors.accent : colors.danger;

  return (
    <View>
      <View style={styles.topRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(index / total) * 100}%` }]} />
        </View>
        <Text style={styles.position}>
          {t('exerciseRunner.sentenceSchema.position', { index: index + 1, total })}
        </Text>
        {state.attempt > 1 && state.phase !== 'closed' ? (
          <Text style={styles.attemptNo}>
            {t('exerciseRunner.sentenceSchema.attemptNo', { count: state.attempt })}
          </Text>
        ) : null}
      </View>

      <Text style={styles.instruction}>{instruction}</Text>

      {audioOn ? (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audio.gated ? (
            <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.pieces')} />
          ) : null}
          {/* This sentence's line of the clip, when the author timed it. */}
          <AudioSegmentButton
            eng={audio}
            segment={audio.segments[row.id] ?? null}
            disabled={disabled || audio.gated}
          />
        </View>
      ) : null}

      {/* Which clause type this sentence is — the only thing on screen that says why the
          fields are these fields. A sequence-only set has no fields to explain, so the
          tag would be answering a question nobody is looking at. */}
      {row.fields.length > 1 ? (
        <Text style={styles.clause}>
          {t(`exerciseRunner.sentenceSchema.clause.${row.clause}`)}
        </Text>
      ) : null}

      {/* Why the set jumped backwards. Without it the order looks broken rather than kept:
          this is the sentence they asked to see again. */}
      {everDeferred.includes(row.id) ? (
        <Text style={styles.skipped}>{t('exerciseRunner.sentenceSchema.skippedEarlier')}</Text>
      ) : null}

      {/* The sentence to rewrite. A prompt and only a prompt: nothing is derived from it,
          and the sentence being built is not shown until it is closed. */}
      {row.source !== '' ? (
        <View style={styles.source}>
          <Text style={styles.sourceLabel}>
            {t('exerciseRunner.sentenceSchema.sourceLabel')}
          </Text>
          <Text style={styles.sourceText}>{row.source}</Text>
        </View>
      ) : null}

      <SchemaBoard
        fields={row.fields}
        placement={state.placement}
        textOf={textOf}
        labels={set.settings.labels}
        hints={set.settings.hints}
        counts={row.counts}
        marks={marks}
        selectedField={armedField}
        onFieldPress={pressField}
        onRemove={(itemId) => !locked && place(takeItem(state.placement, itemId))}
        readOnly={locked}
      />

      {/* The bank goes away once the sentence is closed: there is nothing left to place,
          and leaving it invites input the board no longer takes. */}
      {!locked ? (
        <WordBank
          items={row.bank}
          used={used}
          selected={armedItem}
          onPress={pressItem}
          interactive={!locked}
        />
      ) : null}

      {banner !== null ? (
        <View style={[styles.banner, { borderColor: bannerTone, backgroundColor: `${bannerTone}14` }]}>
          <Text style={[styles.bannerText, { color: bannerTone }]}>
            {bannerText(banner, t)}
          </Text>
          {/* The rule, repeated under the note from the second attempt on. */}
          {banner.hint !== '' ? <Text style={styles.bannerHint}>{banner.hint}</Text> : null}
          {/* The sentence itself, once it is no longer the answer to anything. */}
          {state.phase === 'closed' && state.result?.text ? (
            <Text style={styles.bannerSentence}>{state.result.text}</Text>
          ) : null}
        </View>
      ) : null}

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {audioOn ? (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      ) : null}

      <View style={styles.actions}>
        {state.phase === 'placing' ? (
          <TouchableOpacity
            style={[
              styles.primary,
              (!canCheckRow(state.placement) || sending || disabled) && styles.buttonDisabled,
            ]}
            onPress={() => send(false)}
            disabled={!canCheckRow(state.placement) || sending || disabled}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textInverted} />
            ) : (
              <Text style={styles.primaryText}>
                {t('exerciseRunner.sentenceSchema.check', {
                  placed: used.length,
                  total: row.bank.length,
                })}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        {state.phase === 'checked' ? (
          <TouchableOpacity style={styles.primary} onPress={fix} disabled={disabled}>
            <Text style={styles.primaryText}>
              {t('exerciseRunner.sentenceSchema.fix', { count: state.result?.wrong ?? 0 })}
            </Text>
          </TouchableOpacity>
        ) : null}

        {state.phase === 'closed' ? (
          <TouchableOpacity style={styles.primary} onPress={() => move(nextPosition(position))}>
            <Text style={styles.primaryText}>
              {lastSentence
                ? t('exerciseRunner.sentenceSchema.finishSet')
                : t('exerciseRunner.sentenceSchema.nextSentence')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {state.phase !== 'closed' ? (
          <View style={styles.secondaryRow}>
            {total > 1 ? (
              <TouchableOpacity
                style={styles.secondary}
                onPress={skip}
                disabled={sending || disabled}
              >
                <Text style={styles.secondaryText}>
                  {t('exerciseRunner.sentenceSchema.skip')}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => send(true)}
              disabled={sending || disabled}
            >
              <Text style={styles.secondaryText}>
                {t('exerciseRunner.sentenceSchema.reveal')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Every board of the set, for the aggregate that closes the attempt.
 *
 * Sentences never answered are sent as they stand — empty, or half placed. The engine
 * regrades all of them from the current key, and a sentence with nothing on it is worth
 * nothing, which is exactly what walking away from it means.
 */
function submissionRows(set: SentenceSchemaSet, rows: Record<string, RowState>) {
  return set.rows.map((row) => ({
    rowId: row.id,
    placement: rows[row.id]?.placement ?? {},
    revealed: rows[row.id]?.revealed === true,
  }));
}

/**
 * The note under the board, in the learner's language.
 *
 * The author's own words travel as text and are shown as written. `default` is a code
 * instead — the handoff writes those defaults as English prose, and this app renders
 * student copy in three languages, so what crosses the wire is which default, not its
 * wording (plan 52 §5).
 */
function bannerText(
  banner: SentenceSchemaBanner,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (banner.source !== 'default') return banner.text;
  return banner.code === 'order'
    ? t('exerciseRunner.sentenceSchema.wrongOrder')
    : t('exerciseRunner.sentenceSchema.notInSentence');
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
    position: {
      fontSize: 12,
      color: colors.textMuted,
    },
    attemptNo: {
      fontSize: 12,
      color: colors.textMuted,
    },
    audio: {
      marginBottom: 12,
    },
    instruction: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    clause: {
      alignSelf: 'flex-start',
      fontSize: 11,
      color: colors.textSecondary,
      backgroundColor: colors.backgroundInput,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 3,
      marginBottom: 10,
    },
    skipped: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 8,
    },
    source: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 12,
    },
    sourceLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 2,
    },
    sourceText: {
      fontSize: 15,
      lineHeight: 21,
      color: colors.textPrimary,
    },
    banner: {
      marginTop: 14,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    bannerText: {
      fontSize: 13.5,
      lineHeight: 19,
      fontWeight: '600',
    },
    bannerHint: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    bannerSentence: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    error: {
      fontSize: 12.5,
      color: colors.danger,
      marginTop: 10,
    },
    actions: {
      marginTop: 14,
      gap: 10,
    },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 10,
    },
    secondary: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 11,
      alignItems: 'center',
    },
    secondaryText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.textSecondary,
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
    doneHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 12,
    },
  });
