import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { recentAttempts, revealAnswers, type SubmitAttemptResponse } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import type { ExerciseBodyProps } from './ExerciseBody';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import {
  buildGapFillAnswer,
  freeBankSlots,
  gapFillCanSubmit,
  readGapFillTask,
  readGapVerdicts,
  readRevealedGaps,
  restoreGapFill,
  type GapFillGapToken,
  type GapKey,
  type GapVerdict,
  type RestoredGapFill,
  type RevealedGap,
} from './templates/wordBankGapFill';

const TAP_MIN = 44;

/**
 * `word_bank_gap_fill` — sentences with gaps, filled from a shared bank or typed, as the web
 * runner plays it (plan 35).
 *
 * The body owns its checks: a practice attempt is reopened on every check, so the learner
 * checks, sees which gaps are right and why the others are not, fixes those and checks again.
 * A right gap locks — its word is settled, and moving it would only undo a right answer. The
 * words themselves are never told by a check; «Show answers» asks `/reveal` for them, which is
 * recorded on the attempt and closes it. The item closes on an all-right check or on a reveal,
 * and only then does the shell's Next appear.
 */
export function WordBankGapFillBody({
  display,
  disabled,
  checkTable,
  finishTable,
  openAttempt,
  verdict: shellVerdict,
}: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const task = useMemo(() => readGapFillTask(display.content), [display.content]);
  const labels = useMemo(() => {
    const out: Record<GapKey, string> = {};
    for (const sentence of task.sentences) {
      for (const token of sentence.tokens) if (token.kind === 'gap') out[token.gapKey] = token.label;
    }
    return out;
  }, [task]);

  const [values, setValues] = useState<Record<GapKey, string>>({});
  const [selected, setSelected] = useState<GapKey | null>(null);
  /** The last check's verdicts, and the words they were given for. */
  const [verdicts, setVerdicts] = useState<Record<GapKey, GapVerdict>>({});
  const [checkedWords, setCheckedWords] = useState<Record<GapKey, string>>({});
  const [lastResponse, setLastResponse] = useState<SubmitAttemptResponse | null>(null);
  const [revealed, setRevealed] = useState<Record<GapKey, RevealedGap> | null>(null);
  const [checks, setChecks] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    The last check, put back. The engine starts a fresh attempt after a reload — checks are
    unlimited, so nothing is lost by it — but the learner's words would be, so the board they
    left is restored from the attempt list, the way the web restores it. Only into an untouched
    board: a learner who has started placing words has already chosen to start over.
  */
  const [restored, setRestored] = useState<RestoredGapFill | null>(null);
  useEffect(() => {
    let live = true;
    recentAttempts(display.id, 1).then((rows) => {
      if (!live || rows.length === 0) return;
      const board = restoreGapFill(rows[0], task);
      if (board === null) return;
      setValues((prev) => (Object.keys(prev).length > 0 ? prev : board.values));
      setVerdicts((prev) => (Object.keys(prev).length > 0 ? prev : board.verdicts));
      setCheckedWords((prev) => (Object.keys(prev).length > 0 ? prev : board.values));
      setChecks((n) => (n > 0 ? n : 1));
      setRestored(board);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.id]);

  const startOver = () => {
    setValues({});
    setVerdicts({});
    setCheckedWords({});
    setChecks(0);
    setSelected(null);
    setRestored(null);
  };

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;

  const closed = disabled || revealed !== null;
  const locked = useCallback((gapKey: GapKey) => verdicts[gapKey]?.correct === true, [verdicts]);
  const canEdit = !closed && !sending && !audioLocked;

  /** A verdict counts only while the gap still holds the word it was given for. */
  const verdictFor = (gapKey: GapKey): GapVerdict | null => {
    const v = verdicts[gapKey];
    if (v === undefined) return null;
    return checkedWords[gapKey] === (values[gapKey] ?? '') ? v : null;
  };

  const free = useMemo(
    () => (task.bank === null ? [] : freeBankSlots(task.bank, values, task.allowReuse)),
    [task, values],
  );
  const remaining = free.filter(Boolean).length;
  const allFilled = gapFillCanSubmit(task.gapKeys, values);

  // Keep the selection on a gap that can take a word.
  useEffect(() => {
    if (selected !== null && locked(selected)) setSelected(null);
  }, [selected, locked]);

  const place = (word: string) => {
    if (!canEdit) return;
    const target =
      selected ??
      task.gapKeys.find((gapKey) => !locked(gapKey) && (values[gapKey] ?? '') === '') ??
      null;
    if (target === null) return;
    setValues((prev) => ({ ...prev, [target]: word }));
    // Move on to the next empty gap, the way a learner reads.
    const next = task.gapKeys.find(
      (gapKey) => gapKey !== target && !locked(gapKey) && (values[gapKey] ?? '') === '',
    );
    setSelected(next ?? null);
  };

  const pressGap = (gapKey: GapKey) => {
    if (!canEdit || locked(gapKey)) return;
    if ((values[gapKey] ?? '') !== '' && task.bank !== null) {
      // A filled gap gives its word back to the bank and becomes the target.
      setValues((prev) => ({ ...prev, [gapKey]: '' }));
      setSelected(gapKey);
      return;
    }
    setSelected((prev) => (prev === gapKey ? null : gapKey));
  };

  const check = async () => {
    if (!allFilled || sending || closed) return;
    setSending(true);
    setError(null);
    try {
      const response = await checkTable(buildGapFillAnswer(task.gapKeys, values));
      setVerdicts(readGapVerdicts(response.details));
      setCheckedWords({ ...values });
      setLastResponse(response);
      setChecks((n) => n + 1);
      setSelected(null);
      if (response.correct) finishTable(response);
    } catch {
      setError(t('exerciseRunner.gapFill.checkFailed'));
    } finally {
      setSending(false);
    }
  };

  const reveal = async () => {
    if (sending || closed || lastResponse === null) return;
    setSending(true);
    setError(null);
    try {
      const attemptId = await openAttempt();
      const answers = readRevealedGaps(await revealAnswers(display.id, attemptId));
      setRevealed(answers);
      setSelected(null);
      finishTable(lastResponse);
    } catch {
      setError(t('exerciseRunner.gapFill.revealFailed'));
    } finally {
      setSending(false);
    }
  };

  const wrongNotes = task.gapKeys.flatMap((gapKey) => {
    const v = verdictFor(gapKey);
    return v !== null && !v.correct && revealed === null
      ? [{ gapKey, text: v.explanation }]
      : [];
  });
  const revealNotes =
    revealed === null
      ? []
      : task.gapKeys.flatMap((gapKey) => {
          const r = revealed[gapKey];
          return r !== undefined && r.why !== null ? [{ gapKey, text: r.why }] : [];
        });

  const renderGap = (token: GapFillGapToken) => {
    const gapKey = token.gapKey;
    const shown = revealed?.[gapKey];
    const word = values[gapKey] ?? '';
    const v = verdictFor(gapKey);
    const wasRight = v?.correct === true;
    const tone =
      shown !== undefined && !wasRight
        ? colors.neutral300
        : v === null
          ? selected === gapKey
            ? colors.accentBase
            : colors.neutral500
          : v.correct
            ? colors.accent300
            : colors.neutral400;

    const box =
      task.bank === null && shown === undefined && !wasRight ? (
        <TextInput
          style={[styles.typedGap, { borderColor: tone }]}
          value={word}
          onChangeText={(text) => setValues((prev) => ({ ...prev, [gapKey]: text }))}
          editable={canEdit}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder={token.label}
          placeholderTextColor={colors.neutral500}
          accessibilityLabel={token.label}
        />
      ) : (
        <TouchableOpacity
          style={[styles.gap, { borderColor: tone }, word === '' && styles.gapEmpty]}
          onPress={() => pressGap(gapKey)}
          disabled={!canEdit || wasRight}
          accessibilityRole="button"
          accessibilityLabel={
            word === ''
              ? t('exerciseRunner.gapFill.emptyGap', { label: token.label })
              : `${token.label}: ${shown?.word ?? word}`
          }
        >
          <Text
            style={[
              styles.gapText,
              {
                color:
                  shown !== undefined || v !== null
                    ? tone
                    : word === ''
                      ? colors.neutral500
                      : colors.text,
              },
            ]}
          >
            {shown !== undefined && !wasRight ? shown.word : word === '' ? token.label : word}
          </Text>
        </TouchableOpacity>
      );

    return (
      <View key={gapKey} style={styles.gapWrap}>
        {token.before !== '' ? <Text style={styles.word}>{token.before}</Text> : null}
        {box}
        {token.after !== '' ? <Text style={styles.word}>{token.after}</Text> : null}
      </View>
    );
  };

  return (
    <View>
      {restored !== null && !closed && lastResponse === null ? (
        <View style={styles.restored}>
          <Text style={styles.restoredText}>
            {t('exerciseRunner.gapFill.restored', {
              correct: String(restored.correct),
              total: String(restored.total),
            })}
          </Text>
          <TouchableOpacity onPress={startOver} accessibilityRole="button">
            <Text style={styles.restoredLink}>{t('exerciseRunner.gapFill.startOver')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {audioOn ? (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!closed} />
          {audioLocked ? (
            <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.gaps')} />
          ) : null}
        </View>
      ) : null}

      {task.sentences.map((sentence) => (
        <View key={sentence.id} style={styles.sentence}>
          <View style={styles.line}>
            {sentence.tokens.map((token, index) =>
              token.kind === 'gap' ? (
                renderGap(token)
              ) : (
                <Text key={`${sentence.id}-${index}`} style={styles.word}>
                  {token.text}
                </Text>
              ),
            )}
          </View>
          {sentence.hint !== undefined && !closed ? (
            <Text style={styles.hint}>{sentence.hint}</Text>
          ) : null}
        </View>
      ))}

      {task.bank !== null && !closed ? (
        <View style={styles.bankBlock}>
          {task.showBankCount ? (
            <Text style={styles.remaining}>
              {t('exerciseRunner.gapFill.remaining', { count: String(remaining) })}
            </Text>
          ) : null}
          <View style={styles.bank}>
            {task.bank.map((word, index) => {
              const available = free[index];
              return (
                <TouchableOpacity
                  key={`${word}-${index}`}
                  style={[styles.chip, !available && styles.chipSpent]}
                  onPress={() => available && place(word)}
                  disabled={!available || !canEdit}
                  accessibilityRole="button"
                  accessibilityLabel={word}
                >
                  <Text style={[styles.chipText, !available && styles.chipTextSpent]}>{word}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {[...wrongNotes, ...revealNotes].map((note) => (
        <View key={note.gapKey} style={styles.note}>
          <Text style={styles.noteLabel}>
            {labels[note.gapKey]} ·{' '}
            {revealed === null
              ? t('exerciseRunner.gapFill.wrong')
              : t('exerciseRunner.gapFill.answer', { word: revealed[note.gapKey]?.word ?? '' })}
          </Text>
          {note.text ? <Text style={styles.noteText}>{note.text}</Text> : null}
        </View>
      ))}

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {!closed ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, (!allFilled || sending || audioLocked) && styles.btnDim]}
            onPress={() => void check()}
            disabled={!allFilled || sending || audioLocked}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.accent300} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {allFilled
                  ? checks > 0
                    ? t('exerciseRunner.gapFill.checkAgain', { n: String(checks + 1) })
                    : t('exerciseRunner.gapFill.check')
                  : t('exerciseRunner.gapFill.fillEveryGap')}
              </Text>
            )}
          </TouchableOpacity>
          {lastResponse !== null ? (
            <TouchableOpacity
              style={[styles.ghostBtn, sending && styles.btnDim]}
              onPress={() => void reveal()}
              disabled={sending}
              accessibilityRole="button"
            >
              <Text style={styles.ghostBtnText}>{t('exerciseRunner.gapFill.showAnswers')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {audioOn ? (
        <AudioTranscript
          audio={audio.audio}
          revealed={shellVerdict?.audioTranscript !== undefined}
          delivered={shellVerdict?.audioTranscript ?? null}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    audio: {
      marginBottom: 14,
    },
    restored: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginBottom: 14,
    },
    restoredText: {
      fontSize: 13,
      color: colors.neutral400,
      flexShrink: 1,
    },
    restoredLink: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.accentBase,
    },
    sentence: {
      marginBottom: 14,
    },
    line: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 6,
      rowGap: 8,
    },
    word: {
      fontSize: 18,
      lineHeight: 26,
      color: colors.text,
    },
    gapWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    gap: {
      minWidth: 72,
      minHeight: 36,
      paddingHorizontal: 10,
      borderBottomWidth: 2,
      borderRadius: 6,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gapEmpty: {
      borderStyle: 'dashed',
      borderWidth: 1.5,
    },
    gapText: {
      fontSize: 17,
      fontWeight: '500',
    },
    // Every typed gap is the same width: sizing one to its answer would give its length away.
    typedGap: {
      width: 132,
      minHeight: 36,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderBottomWidth: 2,
      borderRadius: 6,
      backgroundColor: colors.surface,
      fontSize: 17,
      color: colors.text,
    },
    hint: {
      fontSize: 13,
      color: colors.neutral400,
      marginTop: 6,
    },
    bankBlock: {
      marginTop: 6,
      marginBottom: 6,
    },
    remaining: {
      fontSize: 12,
      color: colors.neutral500,
      marginBottom: 8,
    },
    bank: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.accent900,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSpent: {
      backgroundColor: colors.neutral800,
    },
    chipText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    chipTextSpent: {
      color: colors.neutral500,
      textDecorationLine: 'line-through',
    },
    note: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    noteLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.neutral400,
      marginBottom: 4,
    },
    noteText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    error: {
      marginTop: 12,
      fontSize: 13,
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
    ghostBtn: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.neutral800,
      minHeight: TAP_MIN,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostBtnText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.neutral400,
    },
    btnDim: {
      opacity: 0.5,
    },
  });
