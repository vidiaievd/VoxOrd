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
import type { AudioTranscript as AudioTranscriptWords } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  askedKeys,
  buildInflectionTableSubmission,
  canCheck,
  cellKey,
  cellState,
  closingVerdict,
  failures,
  keepOnRetry,
  readInflectionTableProjection,
  readInflectionTableVerdict,
  rowChip,
  setCell,
  type CellState,
  type InflectionTableProjection,
  type InflectionTableValues,
  type InflectionTableVerdict,
  type ProjectedRow,
  type ProjectedSlot,
  type RowChip,
} from './templates/inflectionTable';

/** Every cell and bank form is comfortably tappable. */
const TAP_MIN = 44;

/**
 * `inflection_table` — lemmas down, forms across, the whole table checked as one (plan 69).
 *
 * A table that arrives carrying any part of its key is refused rather than played — see
 * `readInflectionTableProjection`.
 */
export function InflectionTableBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const table = useMemo(
    () => readInflectionTableProjection(display.content),
    [display.content],
  );

  if (table === null)
    return <UnreadableTable onAnswerChange={onAnswerChange} />;
  return <InflectionTableRun {...props} table={table} />;
}

/** Nothing playable: the table arrived with its key on it, or in a shape this app cannot read. */
function UnreadableTable({
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
        {t('exerciseRunner.inflectionTable.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {t('exerciseRunner.inflectionTable.unavailableDesc')}
      </Text>
    </View>
  );
}

/**
 * The student's side of the table: fill the asked cells, hand the table in, read what comes
 * back, fix the wrong ones and hand it in again.
 *
 * **Row cards**, the handoff's phone layout (§7.8): one card per lemma, its chip on the right
 * after a check, one line per form — the slot's name, then the cell. The web draws a grid on
 * a wide surface; a phone never is one.
 *
 * **Typing** draws a field per asked cell, with autocorrect, auto-capitalisation and the
 * spell checker off — any of them would repair exactly what is being asked: the ending
 * (IT-X7). **Bank** draws a slot per cell and the forms beneath: tap a form, then a cell;
 * tap a filled cell with nothing in hand to take the form out again.
 *
 * It owns nothing about the outcome. Which cell is right, which are frozen, whether the table
 * is closed and whether it passed are the server's; nothing here knows a key, so there is no
 * branch that could mark a cell right before a check.
 *
 * How it meets the shell is `sort_into_buckets`' (plan 69 §3.4): a check is `checkTable`,
 * which opens the attempt on the first one and submits the whole table; a re-check is
 * another submit onto that same attempt, counted against the author's budget. The check that
 * *closes* the table is reported through `finishTable`, with the engine's `passed` as the
 * outcome (see `closingVerdict`), and the footer's Continue and Try again take it from there.
 * The buttons are not sticky (deviation 16): the shell's `ScrollView` owns the scroll.
 */
function InflectionTableRun({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  table,
}: ExerciseBodyProps & { table: InflectionTableProjection }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [values, setValues] = useState<InflectionTableValues>({});
  /** The last check. `null` before the first and again after a retry. */
  const [verdict, setVerdict] = useState<InflectionTableVerdict | null>(null);
  /**
   * Cells the server froze, cumulative. Held apart from the verdict because it outlives it:
   * a retry drops the marks and keeps the freeze (plan 54's lesson).
   */
  const [locked, setLocked] = useState<string[]>([]);
  /** The check the table is on — one past the last once a retry has been made. */
  const [attempt, setAttempt] = useState(1);
  /** Bank mode: the form in hand, waiting for a cell. */
  const [held, setHeld] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** So the closing check is reported once, whatever a retried network call does. */
  const reported = useRef(false);

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;
  /** The clip's words, once the check that closed the table earned them (plan 56 §3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(
    null,
  );

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`): the table is
  // handed in from here, and a second submit on a closed table is a refusal.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  const { rows, slots, settings } = table;
  const bank = settings.input === 'bank';
  const keys = useMemo(() => askedKeys(table), [table]);
  const total = keys.length;
  const filled = keys.filter(key => (values[key] ?? '').trim() !== '').length;
  const closed = verdict?.closed === true;
  const checked = verdict !== null;
  const canEdit = !disabled && !checked && !sending && !audioLocked;
  const checkable = canCheck(keys, values, locked);
  const wrong = failures(verdict);
  const slotLabel = useMemo(
    () => new Map(slots.map(s => [s.id, s.label])),
    [slots],
  );
  const lemmaOf = useMemo(
    () => new Map(rows.map(r => [r.id, r.lemma])),
    [rows],
  );

  /**
   * Hand the table in. The verdict decides everything that follows, including whether the
   * table is over — `closed` is the server's word, never a count kept here.
   */
  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setHeld(null);
    try {
      const response = await checkTable(buildInflectionTableSubmission(values));
      const details = readInflectionTableVerdict(response.details);
      if (details === null) {
        setError(t('exerciseRunner.inflectionTable.sendFailed'));
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
      // A refusal the engine will keep making — this table is closed, the budget is spent —
      // reads the same as a lost request, but only one is worth pressing again for.
      setError(
        e instanceof ApiError && e.status === 422
          ? t('exerciseRunner.inflectionTable.closedAlready')
          : t('exerciseRunner.inflectionTable.sendFailed'),
      );
    } finally {
      setSending(false);
    }
  }, [checkTable, finishTable, sending, t, values]);

  const change = useCallback(
    (key: string, value: string | null) => {
      setValues(current => setCell(current, locked, key, value));
    },
    [locked],
  );

  /** Bank mode: a form in hand goes into the cell; with nothing in hand a filled cell empties. */
  const tapCell = useCallback(
    (key: string) => {
      if (!canEdit || locked.includes(key)) return;
      if (held !== null) {
        change(key, held);
        setHeld(null);
      } else if ((values[key] ?? '') !== '') {
        change(key, null);
      }
    },
    [canEdit, change, held, locked, values],
  );

  /** «Retry the wrong ones» — exactly the cells found wrong are emptied (IT-R4). */
  const retryWrong = useCallback(() => {
    if (verdict === null) return;
    setValues(current => keepOnRetry(current, verdict, locked));
    setAttempt(verdict.attempt + 1);
    setVerdict(null);
    setHeld(null);
    setError(null);
  }, [locked, verdict]);

  if (rows.length === 0 || total === 0) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          {t('exerciseRunner.inflectionTable.empty')}
        </Text>
        <Text style={styles.noticeDesc}>
          {t('exerciseRunner.inflectionTable.emptyDesc')}
        </Text>
      </View>
    );
  }

  function renderCell(row: ProjectedRow, slot: ProjectedSlot) {
    const cell = row.cells[slot.id];
    if (cell === undefined) return null;
    if (cell.mode === 'prefill') {
      return <Text style={styles.given}>{cell.value}</Text>;
    }

    const key = cellKey(row.id, slot.id);
    const state = cellState(key, values, verdict, locked);
    const value = values[key] ?? '';
    const outcome = verdict?.items.find(item => item.itemId === key);
    const placeholder = cell.hint === undefined ? '' : `${cell.hint}…`;
    const name = t('exerciseRunner.inflectionTable.cellFor', {
      lemma: row.lemma,
      slot: slot.label,
    });
    // Right and wrong ride in the label and the strike-through as well as the colour (IT-X8).
    const label =
      state === 'ok'
        ? `${name}, ${t('exerciseRunner.inflectionTable.cellRight')}`
        : state === 'bad'
        ? `${name}, ${t('exerciseRunner.inflectionTable.cellWrong')}`
        : name;
    const frozen = locked.includes(key);
    const free = canEdit && !frozen;
    const tone = cellTone(state, colors);
    const selected = bank && held !== null && value === '' && free;

    return (
      <View style={styles.cellWrap}>
        {bank ? (
          <TouchableOpacity
            onPress={() => tapCell(key)}
            disabled={!free}
            accessibilityRole="button"
            accessibilityLabel={value === '' ? label : `${label}: ${value}`}
            accessibilityHint={
              free && held === null && value !== ''
                ? t('exerciseRunner.inflectionTable.cellClear')
                : undefined
            }
            style={[
              styles.cell,
              { borderColor: tone.border, backgroundColor: tone.bg },
              selected && styles.cellArmed,
            ]}
          >
            <Text
              style={[
                styles.cellText,
                { color: value === '' ? colors.textMuted : tone.fg },
                state === 'bad' && styles.struck,
              ]}
            >
              {value !== '' ? value : placeholder}
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            value={value}
            onChangeText={next => change(key, next)}
            editable={free}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={label}
            // Autocorrect would repair exactly what is being asked: the endings (IT-X7).
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            importantForAutofill="no"
            style={[
              styles.cell,
              styles.cellText,
              {
                borderColor: tone.border,
                backgroundColor: tone.bg,
                color: tone.fg,
              },
              state === 'bad' && styles.struck,
            ]}
          />
        )}
        {outcome?.correctForm !== undefined && !outcome.correct && (
          <Text style={styles.key}>{outcome.correctForm}</Text>
        )}
      </View>
    );
  }

  function renderChip(chip: RowChip | null) {
    if (chip === null) return null;
    const tone =
      chip.tone === 'all'
        ? colors.success
        : chip.tone === 'part'
        ? colors.warning
        : colors.danger;
    return (
      <View
        style={[
          styles.chip,
          { borderColor: tone, backgroundColor: tint(tone) },
        ]}
      >
        <Text style={[styles.chipText, { color: tone }]}>
          {chip.tone === 'all'
            ? t('exerciseRunner.inflectionTable.rowAll')
            : t('exerciseRunner.inflectionTable.rowPart', {
                ok: chip.ok,
                n: chip.asked,
              })}
        </Text>
      </View>
    );
  }

  const progress = verdict !== null ? verdict.correctNow : filled;
  const instruction =
    table.instruction.trim() !== ''
      ? table.instruction
      : t('exerciseRunner.inflectionTable.defaultInstruction');

  return (
    <View>
      <View style={styles.progressRow}>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={t('exerciseRunner.inflectionTable.progress')}
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

      {audioOn && (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audioLocked && (
            <AudioLockNote
              itemNoun={t('exerciseRunner.audio.itemNoun.cells')}
            />
          )}
        </View>
      )}

      <View style={styles.cards}>
        {rows.map(row => (
          <View key={row.id} style={styles.card} accessibilityLabel={row.lemma}>
            <View style={styles.cardHead}>
              <Text style={styles.lemma}>{row.lemma}</Text>
              {row.gloss !== '' && (
                <Text style={styles.gloss}>{row.gloss}</Text>
              )}
              <View style={styles.spacer} />
              {renderChip(rowChip(verdict, settings.rowVerdict, row.id))}
            </View>
            {slots.map(slot =>
              row.cells[slot.id] === undefined ? null : (
                <View key={slot.id} style={styles.line}>
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                  <View style={styles.lineCell}>{renderCell(row, slot)}</View>
                </View>
              ),
            )}
          </View>
        ))}
      </View>

      {/* Always mounted so the announcement is made when the verdict arrives. */}
      <View accessibilityLiveRegion="polite">
        {verdict !== null && (
          <View style={styles.report}>
            <View
              style={[
                styles.score,
                {
                  borderLeftColor: verdict.passed
                    ? colors.success
                    : colors.warning,
                },
              ]}
            >
              <Text
                style={[
                  styles.scoreMain,
                  { color: verdict.passed ? colors.success : colors.warning },
                ]}
              >
                {t('exerciseRunner.inflectionTable.score', {
                  k: verdict.passedItems,
                  count: verdict.totalItems,
                })}
              </Text>
              <Text style={styles.scoreSub}>
                {verdict.passed
                  ? t('exerciseRunner.inflectionTable.passed')
                  : t('exerciseRunner.inflectionTable.below', {
                      pct: verdict.pct,
                    })}
              </Text>
            </View>

            {wrong.map(item => (
              <View key={item.itemId} style={[styles.fb, styles.fbBad]}>
                <Text style={[styles.fbMark, { color: colors.danger }]}>✗</Text>
                <View style={styles.fbBody}>
                  <Text style={styles.fbText}>
                    <Text style={styles.bold}>
                      {lemmaOf.get(item.rowId)} · {slotLabel.get(item.slotId)}
                    </Text>
                    {item.value !== ''
                      ? ` — ${t('exerciseRunner.inflectionTable.wrote')} «${
                          item.value
                        }»`
                      : ` — ${t('exerciseRunner.inflectionTable.blank')}`}
                  </Text>
                  {item.near !== undefined && (
                    <Text style={styles.near}>
                      {item.near === 'diacritic'
                        ? t('exerciseRunner.inflectionTable.nearDiacritic')
                        : t('exerciseRunner.inflectionTable.nearEnding')}
                    </Text>
                  )}
                  {item.why !== undefined && (
                    <Text style={styles.why}>{item.why}</Text>
                  )}
                </View>
              </View>
            ))}

            {wrong.length === 0 && (
              <View style={[styles.fb, styles.fbOk]}>
                <Text style={[styles.fbMark, { color: colors.success }]}>
                  ✓
                </Text>
                <Text style={[styles.fbText, styles.fbBody]}>
                  {t('exerciseRunner.inflectionTable.allRight', {
                    count: rows.length,
                  })}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {bank && !checked && (
        <View style={styles.bank}>
          <Text style={styles.bankTitle}>
            {t('exerciseRunner.inflectionTable.bankLabel')}
          </Text>
          <Text style={styles.bankHint}>
            {held !== null
              ? t('exerciseRunner.inflectionTable.bankSelected', { form: held })
              : t('exerciseRunner.inflectionTable.bankHint')}
          </Text>
          <View style={styles.bankForms}>
            {(table.bank ?? []).map((form, index) => {
              const used = Object.values(values).includes(form);
              const armed = held === form;
              return (
                <TouchableOpacity
                  // The same form can be offered twice (a distractor equal to a key's twin).
                  key={`${form}-${index}`}
                  disabled={!canEdit}
                  onPress={() => setHeld(armed ? null : form)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: armed, disabled: !canEdit }}
                  style={[
                    styles.form,
                    armed && styles.formArmed,
                    used && styles.formUsed,
                  ]}
                >
                  <Text style={styles.formText}>{form}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {audioOn && (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      )}

      {/* The controls belong to the table, not to the shell's footer: for this template they
          are the check itself. Drawn from the last verdict's `closed`, never from a count
          kept here; a closed table leaves the footer's Continue alone (deviation 12). */}
      <View style={styles.actions}>
        {!checked ? (
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
              <ActivityIndicator size="small" color={colors.textInverted} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {t('exerciseRunner.inflectionTable.check')}
              </Text>
            )}
          </TouchableOpacity>
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
                {t('exerciseRunner.inflectionTable.retryWrong', {
                  n: verdict?.attempt ?? attempt,
                  max: settings.attempts,
                })}
              </Text>
            </TouchableOpacity>
          )
        )}
        {closed && (
          <Text style={styles.closedHint}>
            {t('exerciseRunner.inflectionTable.doneHint')}
          </Text>
        )}
      </View>
    </View>
  );
}

/** The colours of one asked cell — `it-r-cell` and its four states. */
function cellTone(
  state: CellState,
  colors: ColorScheme,
): { border: string; bg: string; fg: string } {
  switch (state) {
    case 'ok':
      return {
        border: colors.success,
        bg: tint(colors.success),
        fg: colors.success,
      };
    case 'bad':
      return {
        border: colors.danger,
        bg: tint(colors.danger),
        fg: colors.danger,
      };
    case 'filled':
      return {
        border: colors.accent,
        bg: colors.accentLight,
        fg: colors.textPrimary,
      };
    case 'empty':
      return {
        border: colors.textMuted,
        bg: colors.backgroundInput,
        fg: colors.textPrimary,
      };
  }
}

/** A pale wash of a `#rrggbb` colour, for a cell or chip background. */
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
      gap: 10,
      marginBottom: 12,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.backgroundInput,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accent,
    },
    progressCount: {
      fontSize: 11,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    instruction: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
      lineHeight: 21,
      marginBottom: 14,
    },
    audio: {
      marginBottom: 12,
    },
    bold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cards: {
      gap: 6,
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 7,
    },
    lemma: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    gloss: {
      fontSize: 11,
      color: colors.textMuted,
      flexShrink: 1,
    },
    spacer: {
      flex: 1,
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
      alignSelf: 'center',
    },
    chipText: {
      fontSize: 11,
      fontWeight: '600',
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    slotLabel: {
      width: 96,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    lineCell: {
      flex: 1,
      minWidth: 0,
    },
    given: {
      fontSize: 16,
      color: colors.textMuted,
      paddingVertical: 7,
      paddingHorizontal: 4,
    },
    cellWrap: {
      gap: 2,
    },
    cell: {
      minHeight: TAP_MIN,
      borderWidth: 1,
      borderBottomWidth: 2,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      justifyContent: 'center',
    },
    cellText: {
      fontSize: 16,
    },
    // Bank mode: an empty cell ready to take the form in hand.
    cellArmed: {
      borderWidth: 2,
      borderColor: colors.accent,
    },
    struck: {
      textDecorationLine: 'line-through',
    },
    key: {
      fontSize: 14,
      color: colors.success,
      paddingLeft: 2,
    },
    report: {
      marginTop: 14,
      gap: 8,
    },
    score: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 10,
      borderLeftWidth: 3,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    scoreMain: {
      fontSize: 18,
      fontWeight: '800',
    },
    scoreSub: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    fb: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    fbBad: {
      backgroundColor: tint(colors.danger),
    },
    fbOk: {
      backgroundColor: tint(colors.success),
    },
    fbMark: {
      fontSize: 14,
      fontWeight: '700',
      marginTop: 1,
    },
    fbBody: {
      flex: 1,
    },
    fbText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    near: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 3,
    },
    why: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: 3,
    },
    bank: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderStyle: 'dashed',
      gap: 8,
    },
    bankTitle: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    bankHint: {
      fontSize: 12.5,
      color: colors.textSecondary,
    },
    bankForms: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    form: {
      minHeight: TAP_MIN,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 8,
      justifyContent: 'center',
    },
    formArmed: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    formUsed: {
      opacity: 0.45,
    },
    formText: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
      marginTop: 10,
    },
    actions: {
      marginTop: 16,
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      minHeight: TAP_MIN,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    btnDim: {
      opacity: 0.5,
    },
    closedHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
