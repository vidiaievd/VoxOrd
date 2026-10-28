import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ApiError } from '../../api/client';
import {
  findOpenBoardCheck,
  type AudioTranscript as AudioTranscriptWords,
} from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import {
  AudioGateScreen,
  AudioLockNote,
  AudioSegmentButton,
  AudioTranscript,
  ExerciseAudioPlayer,
} from './audio';
import type { ExerciseBodyProps, FooterAction } from './ExerciseBody';
import { BodyFooter } from './BodyFooter';
import {
  buildInformationTransferSubmission,
  canCheck,
  cellState,
  closingVerdict,
  counts,
  failures,
  keepOnRetry,
  markKey,
  readInformationTransferProjection,
  readInformationTransferVerdict,
  requiredHeld,
  setCell,
  valuesFromVerdict,
  type CellState,
  type InformationTransferItemResult,
  type InformationTransferProjection,
  type InformationTransferValues,
  type InformationTransferVerdict,
  type ProjectedField,
} from './templates/informationTransfer';

/** Every cell and button is comfortably tappable. */
const TAP_MIN = 44;

/**
 * `information_transfer` — a text or a recording, and a blank to fill in from it, the whole
 * blank checked as one (plan 73, phase 8; INF-V1…V5).
 *
 * A blank that arrives carrying any part of its key is refused rather than played — see
 * `readInformationTransferProjection`.
 */
export function InformationTransferBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const blank = useMemo(
    () => readInformationTransferProjection(display.content),
    [display.content],
  );

  if (blank === null)
    return <UnreadableBlank onAnswerChange={onAnswerChange} />;
  return <InformationTransferRun {...props} blank={blank} />;
}

/** Nothing playable: the blank arrived with its key, or in a shape this app cannot read. */
function UnreadableBlank({
  onAnswerChange,
}: Pick<ExerciseBodyProps, 'onAnswerChange'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>
        {t('exerciseRunner.informationTransfer.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {t('exerciseRunner.informationTransfer.unavailableDesc')}
      </Text>
    </View>
  );
}

/**
 * The learner's side: read or listen, fill the blank, hand it in, read what was not counted,
 * fix those cells and hand it in again — every check a submit onto the one attempt.
 *
 * Nothing on this screen knows which value is right. The verdict of every cell, the author's
 * reason for one not counted, the standard form or the key (only where `revealKey` lets it
 * out), the score and whether the blank is closed are the server's, and are drawn as they came
 * (plan 73 §3.6).
 *
 * How it meets the shell is `inflection_table`'s: a check is `checkTable`, and the check that
 * *closes* the blank is reported through `finishTable` with the engine's `passed` as the
 * outcome. «Ny runde» is then the footer's «Try again» — a new attempt, which the shell
 * remounts this body for.
 *
 * Three things are held here that are not one thing: **`locked`** (the server's frozen set,
 * which outlives the verdict), **`verdict`** (the last check, `null` between a retry and the
 * next) and **`attempt`** (the check the blank is *on*, which a retry moves past the last
 * one before the server has been asked anything).
 */
function InformationTransferRun({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  setFooterAction,
  blank,
}: ExerciseBodyProps & { blank: InformationTransferProjection }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [values, setValues] = useState<InformationTransferValues>({});
  const [verdict, setVerdict] = useState<InformationTransferVerdict | null>(
    null,
  );
  const [locked, setLocked] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(1);
  /** `oneAtATime`: the cell on screen. Only the way into the first check. */
  const [step, setStep] = useState(0);
  const [entered, setEntered] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** So the closing check is reported once, whatever a retried network call does. */
  const reported = useRef(false);

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;
  /** The clip's words, once the check that closed the blank earned them (plan 56 §3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(
    null,
  );

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`): the blank is handed
  // in from here, and a second submit on a closed blank is a refusal.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  /**
   * Pick up a blank this learner left after a check with checks to spare: the cells as they
   * were written, the verdict that came with them, the frozen set and the budget already
   * spent. The first check is the evidence and its budget is the author's, so replaying from
   * an empty blank would hand out a fresh first try. Read rather than started — the engine
   * joins this very attempt when the next check opens one — so that opening a blank and
   * leaving creates nothing.
   */
  const [resuming, setResuming] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const back = readInformationTransferVerdict(
        await findOpenBoardCheck(display.id),
      );
      if (cancelled) return;
      if (back !== null && !back.closed) {
        setValues(valuesFromVerdict(back));
        setVerdict(back);
        setLocked(back.locked);
        setAttempt(back.attempt);
        // The first check was reported before the app was left; it is not evidence twice.
        reported.current = true;
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [display.id]);

  const { fields, answering } = blank;
  const total = fields.length;
  const filled = fields.filter(f => (values[f.id] ?? '').trim() !== '').length;
  const closed = verdict?.closed === true;
  const checked = verdict !== null;
  const canEdit = !disabled && !checked && !sending && !audioLocked;
  const checkable = canCheck(fields, values, locked);
  const wrong = failures(verdict);
  const outcomes = useMemo(
    () => new Map((verdict?.items ?? []).map(item => [item.itemId, item])),
    [verdict],
  );

  /**
   * Hand the blank in. The verdict decides everything that follows, including whether the
   * blank is over — `closed` is the server's word, never a count kept here.
   */
  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await checkTable(
        buildInformationTransferSubmission(values),
      );
      const details = readInformationTransferVerdict(response.details);
      if (details === null) {
        setError(t('exerciseRunner.informationTransfer.sendFailed'));
        return;
      }

      setVerdict(details);
      setLocked(details.locked);
      setAttempt(details.attempt);
      if (response.audioTranscript) setTranscript(response.audioTranscript);
      if (details.closed && !reported.current) {
        reported.current = true;
        finishTable(closingVerdict(response, details));
      }
    } catch (e) {
      // A refusal the engine will keep making — this blank is closed, the budget is spent —
      // reads the same as a lost request, but only one is worth pressing again for. Only the
      // 422 is that refusal: a 409 is the start meeting an attempt already in progress, which
      // is not «finished» and is told as a failed send (it is what a blank left half-started on
      // another device looks like).
      setError(
        e instanceof ApiError && e.status === 422
          ? t('exerciseRunner.informationTransfer.closedAlready')
          : t('exerciseRunner.informationTransfer.sendFailed'),
      );
    } finally {
      setSending(false);
    }
  }, [checkTable, finishTable, sending, t, values]);

  const change = useCallback(
    (key: string, value: string) => {
      setValues(current => setCell(current, locked, key, value));
    },
    [locked],
  );

  /** «Rett opp N felt» — exactly the cells not counted are emptied. */
  const retryWrong = useCallback(() => {
    if (verdict === null) return;
    setValues(current => keepOnRetry(current, verdict, locked));
    setAttempt(verdict.attempt + 1);
    setVerdict(null);
    setError(null);
  }, [locked, verdict]);

  if (resuming) {
    return (
      <View style={styles.notice}>
        <ActivityIndicator color={colors.accentBase} />
      </View>
    );
  }

  // `layout: 'gate'` fills the body with the listen-first screen until it is left.
  if (
    audioOn &&
    audio.audio.settings.layout === 'gate' &&
    !entered &&
    verdict === null
  ) {
    return (
      <AudioGateScreen
        eng={audio}
        interactive={!disabled}
        onStart={() => setEntered(true)}
      />
    );
  }

  if (total === 0) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          {t('exerciseRunner.informationTransfer.empty')}
        </Text>
        <Text style={styles.noticeDesc}>
          {t('exerciseRunner.informationTransfer.emptyDesc')}
        </Text>
      </View>
    );
  }

  // One cell at a time is a way into the first check only; a retry and a reload show it all.
  const walking = answering.oneAtATime && verdict === null && attempt === 1;
  const at = Math.min(step, total - 1);
  const shown = walking ? [fields[at]] : fields;
  const lastStep = at === total - 1;

  const progress = verdict !== null ? verdict.correctNow : filled;
  const heading = blank.title;
  const instruction =
    display.instructions?.[0]?.instructionText ||
    (blank.instruction !== ''
      ? blank.instruction
      : t('exerciseRunner.informationTransfer.defaultInstruction'));
  const formTitle =
    blank.form.formTitle !== ''
      ? blank.form.formTitle
      : t('exerciseRunner.informationTransfer.form');
  const revealedNoKey =
    verdict !== null && !verdict.passed && answering.revealKey === 'never';

  function renderCell(field: ProjectedField) {
    const position = fields.indexOf(field) + 1;
    const outcome = outcomes.get(field.id);
    const frozen = locked.includes(field.id);
    const state = cellState(field.id, values, outcome, locked);
    const value = values[field.id] ?? '';
    const free = canEdit && !frozen;
    const tone = cellTone(state, colors);
    const label =
      field.label.trim() !== ''
        ? field.label
        : t('exerciseRunner.informationTransfer.fieldN', { n: position });
    const hint = outcome?.hint ?? field.hint;
    const mark = outcome === undefined ? null : markKey(outcome.verdict);
    const markText =
      mark === null
        ? null
        : t(`exerciseRunner.informationTransfer.mark.${mark}`);
    const ok = outcome !== undefined && counts(outcome.verdict);
    const segment =
      audioOn && audio.segments[field.id] !== undefined
        ? audio.segments[field.id]
        : null;

    return (
      <View key={field.id} style={styles.cell}>
        <Text style={styles.cellLabel}>{label}</Text>
        {hint !== undefined && hint !== '' && (
          <Text style={styles.cellHint}>{hint}</Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            value={value}
            onChangeText={next => change(field.id, next)}
            editable={free}
            placeholder={field.placeholder}
            placeholderTextColor={colors.neutral500}
            keyboardType={field.numeric ? 'numbers-and-punctuation' : 'default'}
            // Right and wrong ride in the label and the strike-through as well as the colour.
            accessibilityLabel={
              markText === null ? label : `${label}, ${markText}`
            }
            // Autocorrect would repair exactly what is being read off the source.
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            importantForAutofill="no"
            style={[
              styles.input,
              {
                borderColor: tone.border,
                backgroundColor: tone.bg,
                color: tone.fg,
              },
              state === 'bad' && styles.struck,
            ]}
          />
          {field.unit !== '' && <Text style={styles.unit}>{field.unit}</Text>}
        </View>
        {markText !== null && (
          <Text
            style={[
              styles.mark,
              { color: ok ? colors.accent300 : colors.neutral400 },
            ]}
          >
            {ok ? '✓' : '✗'} {markText}
          </Text>
        )}

        {segment !== null && (
          // Free, always: a fragment spends no listen.
          <AudioSegmentButton
            eng={audio}
            segment={segment}
            disabled={disabled || audioLocked}
          />
        )}

        {outcome !== undefined && (
          <Under outcome={outcome} field={field} styles={styles} />
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.progressRow}>
        {heading !== '' && (
          <Text style={styles.progressTitle} numberOfLines={1}>
            {heading}
          </Text>
        )}
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={t('exerciseRunner.informationTransfer.progress')}
          accessibilityValue={{ min: 0, max: total, now: progress }}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${(progress / total) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressCount}>
          {progress}/{total}
        </Text>
      </View>

      <Text style={styles.instruction}>{instruction}</Text>

      {blank.sourceKind === 'audio' ? (
        audioOn && (
          <View style={styles.audio}>
            <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
            {audioLocked && (
              <AudioLockNote
                itemNoun={t('exerciseRunner.audio.itemNoun.cells')}
              />
            )}
          </View>
        )
      ) : (
        <View style={styles.source}>
          {blank.passageTitle !== undefined && blank.passageTitle !== '' && (
            <Text style={styles.sourceTitle}>{blank.passageTitle}</Text>
          )}
          <Text style={styles.sourceText}>{blank.passage}</Text>
        </View>
      )}

      {/* Always mounted so the announcement is made when the verdict arrives. */}
      <View accessibilityLiveRegion="polite">
        {verdict !== null && (
          <View
            style={[
              styles.score,
              {
                borderColor: verdict.passed ? colors.accentBase : colors.neutral800,
                backgroundColor: verdict.passed
                  ? tint(colors.accentBase)
                  : colors.surface,
              },
            ]}
          >
            <Text style={styles.scoreNum}>
              {verdict.passedItems}
              <Text style={styles.scoreOf}>/{total}</Text>
            </Text>
            <View
              style={[
                styles.verdictChip,
                {
                  borderColor: verdict.passed
                    ? colors.accentBase
                    : colors.neutral600,
                },
              ]}
            >
              <Text style={styles.verdictChipText}>
                {verdict.passed
                  ? t('exerciseRunner.informationTransfer.passed')
                  : t('exerciseRunner.informationTransfer.tryAgain')}
              </Text>
            </View>
            <Text style={styles.scoreSub}>
              {t('exerciseRunner.informationTransfer.scoreLine', {
                pct: verdict.pct,
                need: verdict.passPct,
              })}
              {requiredHeld(verdict)
                ? ` · ${t('exerciseRunner.informationTransfer.requiredMissed')}`
                : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.form}>
        <View style={styles.formHead}>
          <Text style={styles.formTitle}>{formTitle}</Text>
          <View style={styles.spacer} />
          {walking && (
            <Text style={styles.stepOf}>
              {t('exerciseRunner.informationTransfer.stepOf', {
                k: at + 1,
                n: total,
              })}
            </Text>
          )}
        </View>
        <View style={styles.cells}>
          {shown.map(field => (field === undefined ? null : renderCell(field)))}
        </View>
      </View>

      {revealedNoKey && (
        <Text style={styles.noKey}>
          {t('exerciseRunner.informationTransfer.noKey')}
        </Text>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {audioOn && (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      )}

      {/* The check is the blank's own, drawn from the last verdict's `closed`, never from a
          count kept here; a closed blank leaves the footer's Continue alone. Where the runner
          offers its footer the button goes there, above the keyboard that covered it under
          the blank while a field was typed in. */}
      <BodyFooter
        set={setFooterAction}
        action={
          disabled
            ? null
            : !checked
            ? walking && !lastStep
              ? ({
                  label: `${t('exerciseRunner.informationTransfer.next')} →`,
                  onPress: () => setStep(at + 1),
                  disabled: audioLocked,
                } satisfies FooterAction)
              : ({
                  label: t('exerciseRunner.informationTransfer.check'),
                  onPress: () => {
                    send();
                  },
                  disabled: !checkable || audioLocked,
                  busy: sending,
                } satisfies FooterAction)
            : !closed && wrong.length > 0
            ? ({
                label: `↺ ${
                  answering.attempts > 0
                    ? t('exerciseRunner.informationTransfer.retry', {
                        count: wrong.length,
                        k: verdict.attempt + 1,
                        max: answering.attempts,
                      })
                    : t('exerciseRunner.informationTransfer.retryUnlimited', {
                        count: wrong.length,
                      })
                }`,
                onPress: retryWrong,
                disabled: sending,
              } satisfies FooterAction)
            : null
        }
      />
      <View style={styles.actions}>
        {setFooterAction !== undefined ? null : !checked ? (
          walking && !lastStep ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (disabled || audioLocked) && styles.btnDim,
              ]}
              onPress={() => setStep(at + 1)}
              disabled={disabled || audioLocked}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {t('exerciseRunner.informationTransfer.next')} →
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!checkable || disabled || sending || audioLocked) &&
                  styles.btnDim,
              ]}
              onPress={() => void send()}
              disabled={!checkable || disabled || sending || audioLocked}
              accessibilityRole="button"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.accent300} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {t('exerciseRunner.informationTransfer.check')}
                </Text>
              )}
            </TouchableOpacity>
          )
        ) : (
          !closed &&
          wrong.length > 0 && (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (disabled || sending) && styles.btnDim,
              ]}
              onPress={retryWrong}
              disabled={disabled || sending}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                ↺{' '}
                {answering.attempts > 0
                  ? t('exerciseRunner.informationTransfer.retry', {
                      count: wrong.length,
                      k: verdict.attempt + 1,
                      max: answering.attempts,
                    })
                  : t('exerciseRunner.informationTransfer.retryUnlimited', {
                      count: wrong.length,
                    })}
              </Text>
            </TouchableOpacity>
          )
        )}
        {closed && (
          <Text style={styles.closedHint}>
            {t('exerciseRunner.informationTransfer.doneHint')}
          </Text>
        )}
      </View>
    </View>
  );
}

/** The lines under a checked cell: the standard form, the unread note, the key, the reason. */
function Under({
  outcome,
  field,
  styles,
}: {
  outcome: InformationTransferItemResult;
  field: ProjectedField;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  const canonical = outcome.canonical;
  // One explicit branch per format type — a dynamic key would not type-check.
  let unreadNote = '';
  switch (field.type) {
    case 'time':
      unreadNote = t('exerciseRunner.informationTransfer.hint.unreadTime');
      break;
    case 'date':
      unreadNote = t('exerciseRunner.informationTransfer.hint.unreadDate');
      break;
    case 'number':
      unreadNote = t('exerciseRunner.informationTransfer.hint.unreadNumber');
      break;
    case 'money':
      unreadNote = t('exerciseRunner.informationTransfer.hint.unreadMoney');
      break;
    case 'phone':
      unreadNote = t('exerciseRunner.informationTransfer.hint.unreadPhone');
      break;
    case 'name':
    case 'word':
      // Free text is always readable; the core never returns `unread` for it.
      break;
  }
  return (
    <>
      {outcome.verdict === 'format' && canonical !== undefined && (
        <Text style={styles.under}>
          {t('exerciseRunner.informationTransfer.hint.format', {
            form: canonical,
          })}
        </Text>
      )}
      {outcome.verdict === 'unread' && unreadNote !== '' && (
        <Text style={styles.under}>{unreadNote}</Text>
      )}
      {outcome.verdict !== 'format' && canonical !== undefined && (
        <Text style={styles.under}>
          {t('exerciseRunner.informationTransfer.hint.answer')}{' '}
          <Text style={styles.bold}>{canonical}</Text>
        </Text>
      )}
      {!outcome.correct && outcome.why !== undefined && (
        <Text style={styles.why}>{outcome.why}</Text>
      )}
    </>
  );
}

/** The colours of one cell and its four states. */
function cellTone(
  state: CellState,
  colors: ColorScheme,
): { border: string; bg: string; fg: string } {
  switch (state) {
    case 'ok':
      return {
        border: colors.accent300,
        bg: tint(colors.accentBase),
        fg: colors.accent300,
      };
    case 'bad':
      return {
        border: colors.neutral400,
        bg: tint(colors.neutral600),
        fg: colors.neutral400,
      };
    case 'filled':
      return {
        border: colors.accentBase,
        bg: colors.accent900,
        fg: colors.text,
      };
    case 'empty':
      return {
        border: colors.neutral500,
        bg: colors.surface,
        fg: colors.text,
      };
  }
}

/** A pale wash of a `#rrggbb` colour, for a cell or score background. */
function tint(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) return 'transparent';
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
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
      fontWeight: '500',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    noticeDesc: {
      fontSize: 13,
      color: colors.neutral500,
      textAlign: 'center',
      lineHeight: 19,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    progressTitle: {
      flexShrink: 1,
      maxWidth: '40%',
      fontSize: 11,
      color: colors.neutral500,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accentBase,
    },
    progressCount: {
      fontSize: 11,
      color: colors.neutral500,
      fontVariant: ['tabular-nums'],
    },
    instruction: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.neutral400,
      lineHeight: 21,
      marginBottom: 14,
    },
    audio: {
      marginBottom: 14,
    },
    source: {
      borderWidth: 1,
      borderColor: colors.neutral800,
      borderRadius: 12,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 6,
      marginBottom: 14,
    },
    sourceTitle: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.neutral500,
    },
    sourceText: {
      fontSize: 15,
      lineHeight: 23,
      color: colors.text,
    },
    score: {
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
      marginBottom: 14,
    },
    scoreNum: {
      fontSize: 30,
      fontWeight: '500',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    scoreOf: {
      fontSize: 18,
      fontWeight: '400',
      color: colors.neutral500,
    },
    verdictChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    verdictChipText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.accent300,
    },
    scoreSub: {
      fontSize: 12,
      color: colors.neutral400,
      textAlign: 'center',
    },
    form: {
      borderWidth: 1,
      borderColor: colors.neutral800,
      borderRadius: 12,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    formHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.neutral800,
    },
    formTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    stepOf: {
      fontSize: 12,
      color: colors.neutral500,
    },
    spacer: {
      flex: 1,
    },
    cells: {
      gap: 14,
    },
    cell: {
      gap: 4,
    },
    cellLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.neutral400,
    },
    cellHint: {
      fontSize: 11,
      color: colors.neutral500,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    input: {
      flex: 1,
      minHeight: TAP_MIN,
      borderWidth: 1,
      borderBottomWidth: 2,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 16,
    },
    struck: {
      textDecorationLine: 'line-through',
    },
    unit: {
      fontSize: 12,
      color: colors.neutral500,
    },
    mark: {
      fontSize: 11,
      fontWeight: '500',
    },
    under: {
      fontSize: 11,
      color: colors.neutral500,
    },
    bold: {
      fontWeight: '500',
      color: colors.text,
    },
    why: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.neutral400,
      backgroundColor: colors.surface,
      borderLeftWidth: 2,
      borderLeftColor: colors.neutral800,
      borderRadius: 6,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    noKey: {
      marginTop: 12,
      fontSize: 13,
      lineHeight: 19,
      color: colors.neutral400,
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    error: {
      marginTop: 12,
      fontSize: 12.5,
      color: colors.neutral400,
    },
    actions: {
      marginTop: 16,
      gap: 10,
    },
    primaryBtn: {
      borderWidth: 1,
      borderColor: colors.accentBase,
      borderRadius: 14,
      minHeight: TAP_MIN,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.accent300,
    },
    btnDim: {
      opacity: 0.5,
    },
    closedHint: {
      fontSize: 12.5,
      color: colors.neutral500,
      textAlign: 'center',
    },
  });
