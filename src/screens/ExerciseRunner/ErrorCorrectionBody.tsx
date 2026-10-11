import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import type { ExerciseBodyProps } from './ExerciseBody';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import { selfCheck } from '../../api/exercises';
import { SelfCheckButton } from './SelfCheckButton';
import {
  readCorrectionSelfCheck,
  selfCheckBudget,
  type CorrectionSelfCheck,
  type CorrectionSelfCheckItem,
} from './templates/selfCheck';
import {
  EMPTY_EDITS,
  buildEcAnswer,
  changeCount,
  ecCanSubmit,
  insertAt,
  readEcTask,
  restoreWord,
  rewriteWord,
  wordState,
  type EcItem,
  type SpanType,
  type StudentEdits,
} from './templates/errorCorrection';

const NORWEGIAN_CHARS = ['æ', 'ø', 'å'] as const;

/** What is open in the editor: a word to rewrite, or a slot to insert into. */
type Editing = { itemId: string; kind: 'word' | 'slot'; index: number } | null;

/**
 * `error_correction` — find the mistakes in a sentence and correct them word by word, as the
 * web runner plays it (plan 41).
 *
 * Tap a word to rewrite it or strike it out; insert a word before it, or at the end. The
 * colours say only what the learner did, never whether it was right — which words are wrong
 * is withheld until a teacher has read the work, and the engine only ever approves. The
 * footer's Check hands every sentence's edits in at once.
 *
 * The attempt is opened on mount: the counts the author may show ("3 mistakes to find") are
 * computed from the key, so they arrive with the attempt's projection, not with the display.
 */
export function ErrorCorrectionBody({
  display,
  disabled,
  verdict,
  onAnswerChange,
  openAttempt,
  openedContent,
}: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [projection, setProjection] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    openAttempt()
      .then(() => {
        if (live) setProjection(openedContent?.() ?? null);
      })
      // Without the attempt the counts are missing, nothing else: the display document
      // carries every sentence, and the footer's Check opens the attempt again.
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.id]);

  const task = useMemo(() => readEcTask(display.content, projection), [display.content, projection]);
  const [value, setValue] = useState<Record<string, StudentEdits>>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraftState] = useState('');
  // Read on commit instead of `draft`: «Done» can arrive before the render that carries the
  // last letter, and the closure would then save the word one letter short.
  const draftRef = useRef('');
  const setDraft = (text: string) => {
    draftRef.current = text;
    setDraftState(text);
  };
  const caret = useRef({ start: 0, end: 0 });

  useEffect(() => {
    onAnswerChange(buildEcAnswer(task.items, value), ecCanSubmit(task.items, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, value]);

  useEffect(() => {
    if (disabled) setEditing(null);
  }, [disabled]);

  // The self-check: mistakes fixed and left, before a teacher reads it — on the author's budget.
  const budget = selfCheckBudget(display.content);
  const [checked, setChecked] = useState<CorrectionSelfCheck | null>(null);
  const [checksLeft, setChecksLeft] = useState(budget);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const runSelfCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const attemptId = await openAttempt();
      const read = readCorrectionSelfCheck(
        await selfCheck(display.id, attemptId, buildEcAnswer(task.items, value)),
      );
      setChecked(read);
      setChecksLeft(read.checksLeft);
    } catch {
      setCheckError(t('exerciseRunner.errorCorrection.selfCheck.failed'));
    } finally {
      setChecking(false);
    }
  };

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const locked = disabled || (audioOn && audio.gated);

  const touched = task.items.filter((item) => changeCount(value[item.id]) > 0).length;
  const passage = task.mode === 'passage';

  const open = (next: NonNullable<Editing>, text: string) => {
    if (locked) return;
    setEditing(next);
    setDraft(text);
    caret.current = { start: text.length, end: text.length };
  };

  const update = (itemId: string, change: (edits: StudentEdits) => StudentEdits) =>
    setValue((prev) => ({ ...prev, [itemId]: change(prev[itemId] ?? EMPTY_EDITS) }));

  const commit = (item: EcItem, text: string) => {
    if (editing === null) return;
    if (editing.kind === 'word') {
      const word = item.words[editing.index];
      update(item.id, (edits) => rewriteWord(edits, editing.index, word, text));
    } else {
      update(item.id, (edits) => insertAt(edits, editing.index, text));
    }
    setEditing(null);
  };

  const insertChar = (char: string) => {
    const { start, end } = caret.current;
    const current = draftRef.current;
    const at = Math.min(start, current.length);
    setDraft(current.slice(0, at) + char + current.slice(Math.min(end, current.length)));
    caret.current = { start: at + char.length, end: at + char.length };
  };

  const renderEditor = (item: EcItem) => {
    if (editing === null || editing.itemId !== item.id) return null;
    const edits = value[item.id] ?? EMPTY_EDITS;
    const isWord = editing.kind === 'word';
    const word = isWord ? item.words[editing.index] : '';
    const edited = isWord && wordState(edits, editing.index) !== 'plain';
    const existingInsert = !isWord && (edits.ins[editing.index] ?? '') !== '';

    return (
      <View style={styles.editor}>
        <Text style={styles.editorLabel}>
          {isWord
            ? t('exerciseRunner.errorCorrection.wordLabel', { text: word })
            : editing.index >= item.words.length
              ? t('exerciseRunner.errorCorrection.insertEnd')
              : t('exerciseRunner.errorCorrection.insertBeforeLabel', {
                  text: item.words[editing.index],
                })}
        </Text>
        {/* Actions above the field: Android lifts the focused field over the keyboard,
            so whatever sits below it would be hidden while typing. */}
        <View style={styles.editorRow}>
          {task.keyboard
            ? NORWEGIAN_CHARS.map((char) => (
                <Pressable
                  key={char}
                  style={({ pressed }) => [styles.charKey, pressed && styles.charKeyPressed]}
                  onPress={() => insertChar(char)}
                  accessibilityLabel={char}
                >
                  <Text style={styles.charKeyText}>{char}</Text>
                </Pressable>
              ))
            : null}
        </View>
        <View style={styles.editorRow}>
          <TouchableOpacity style={styles.primarySmall} onPress={() => commit(item, draftRef.current)}>
            <Text style={styles.primarySmallText}>{t('exerciseRunner.errorCorrection.done')}</Text>
          </TouchableOpacity>
          {isWord ? (
            <TouchableOpacity style={styles.ghostSmall} onPress={() => commit(item, '')}>
              <Text style={styles.ghostSmallText}>{t('exerciseRunner.errorCorrection.strike')}</Text>
            </TouchableOpacity>
          ) : null}
          {edited ? (
            <TouchableOpacity
              style={styles.ghostSmall}
              onPress={() => {
                update(item.id, (e) => restoreWord(e, editing.index));
                setEditing(null);
              }}
            >
              <Text style={styles.ghostSmallText}>{t('exerciseRunner.errorCorrection.restore')}</Text>
            </TouchableOpacity>
          ) : null}
          {isWord ? (
            <TouchableOpacity
              style={styles.ghostSmall}
              onPress={() =>
                open(
                  { itemId: item.id, kind: 'slot', index: editing.index },
                  edits.ins[editing.index] ?? '',
                )
              }
            >
              <Text style={styles.ghostSmallText}>{t('exerciseRunner.errorCorrection.insertBefore')}</Text>
            </TouchableOpacity>
          ) : null}
          {existingInsert ? (
            <TouchableOpacity style={styles.ghostSmall} onPress={() => commit(item, '')}>
              <Text style={styles.ghostSmallText}>{t('exerciseRunner.errorCorrection.removeInsert')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.ghostSmall} onPress={() => setEditing(null)}>
            <Text style={styles.ghostSmallText}>{t('exerciseRunner.errorCorrection.cancel')}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.editorInput}
          value={draft}
          onChangeText={setDraft}
          onSelectionChange={(event) => {
            caret.current = event.nativeEvent.selection;
          }}
          onSubmitEditing={() => commit(item, draftRef.current)}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          placeholder={isWord ? t('exerciseRunner.errorCorrection.strikePlaceholder') : ''}
          placeholderTextColor={colors.textMuted}
        />
      </View>
    );
  };

  const renderSentence = (item: EcItem) => {
    const edits = value[item.id] ?? EMPTY_EDITS;
    const insertChip = (slot: number) => {
      const inserted = edits.ins[slot];
      if (inserted === undefined || inserted.trim() === '') return null;
      return (
        <TouchableOpacity
          key={`ins-${slot}`}
          style={styles.insertChip}
          disabled={locked}
          onPress={() => open({ itemId: item.id, kind: 'slot', index: slot }, inserted)}
          accessibilityLabel={t('exerciseRunner.errorCorrection.insertedLabel', { text: inserted })}
        >
          <Text style={styles.insertChipText}>+ {inserted}</Text>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.line}>
        {item.words.map((word, index) => {
          const state = wordState(edits, index);
          const active =
            editing?.itemId === item.id && editing.kind === 'word' && editing.index === index;
          return (
            <React.Fragment key={index}>
              {insertChip(index)}
              <TouchableOpacity
                style={[styles.word, active && styles.wordActive]}
                disabled={locked}
                onPress={() =>
                  open(
                    { itemId: item.id, kind: 'word', index },
                    state === 'edited' ? edits.fix[index] ?? word : state === 'removed' ? '' : word,
                  )
                }
                accessibilityLabel={t('exerciseRunner.errorCorrection.wordLabel', { text: word })}
              >
                {state === 'plain' ? (
                  <Text style={styles.wordText}>{word}</Text>
                ) : (
                  <Text>
                    <Text style={styles.wordStruck}>{word}</Text>
                    {state === 'edited' ? (
                      <Text style={styles.wordFixed}> {edits.fix[index]}</Text>
                    ) : null}
                  </Text>
                )}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
        {insertChip(item.words.length)}
      </View>
    );
  };

  return (
    <View>
      {audioOn ? (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audio.gated ? <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.sentences')} /> : null}
        </View>
      ) : null}

      {task.totalErrors !== undefined ? (
        <Text style={styles.toFind}>
          {t('exerciseRunner.errorCorrection.toFind', { count: task.totalErrors })}
        </Text>
      ) : null}
      {task.note !== '' && !disabled ? <Text style={styles.note}>{task.note}</Text> : null}
      {!disabled ? <Text style={styles.howTo}>{t('exerciseRunner.errorCorrection.howTo')}</Text> : null}
      {task.items.length > 1 ? (
        <Text style={styles.progress}>
          {t('exerciseRunner.errorCorrection.progress', { touched, total: task.items.length })}
        </Text>
      ) : null}

      {task.items.map((item, index) => {
        const changes = changeCount(value[item.id]);
        return (
          <View key={item.id} style={[styles.card, passage && index > 0 && styles.cardJoined]}>
            {!passage && task.items.length > 1 ? (
              <Text style={styles.number}>{index + 1}</Text>
            ) : null}
            {renderSentence(item)}
            {renderEditor(item)}

            {!disabled ? (
              <View style={styles.meta}>
                <TouchableOpacity
                  disabled={locked}
                  onPress={() =>
                    open(
                      { itemId: item.id, kind: 'slot', index: item.words.length },
                      (value[item.id] ?? EMPTY_EDITS).ins[item.words.length] ?? '',
                    )
                  }
                >
                  <Text style={styles.link}>{t('exerciseRunner.errorCorrection.addAtEnd')}</Text>
                </TouchableOpacity>
                {passage && item.errorCount !== undefined ? (
                  <Text style={styles.metaText}>
                    {t('exerciseRunner.errorCorrection.inThis', { count: item.errorCount })}
                  </Text>
                ) : null}
                <Text style={styles.metaText}>
                  {changes === 0
                    ? t('exerciseRunner.errorCorrection.noChanges')
                    : t('exerciseRunner.errorCorrection.changes', { count: changes })}
                </Text>
                {changes > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      update(item.id, () => EMPTY_EDITS);
                      setEditing(null);
                    }}
                  >
                    <Text style={styles.link}>{t('exerciseRunner.errorCorrection.reset')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {item.errorTypes !== undefined && !disabled ? (
              <Text style={styles.metaText}>
                {t('exerciseRunner.errorCorrection.types', {
                  types: item.errorTypes.map((type) => typeName(t, type)).join(', '),
                })}
              </Text>
            ) : null}
            {item.hint !== undefined && !disabled ? <HintToggle hint={item.hint} /> : null}
            {!disabled && checked?.items[item.id] !== undefined ? (
              <CorrectionNote feedback={checked.items[item.id]} />
            ) : null}
          </View>
        );
      })}

      {!disabled && budget > 0 ? (
        <SelfCheckButton
          label={t('exerciseRunner.errorCorrection.selfCheck.button', { left: checksLeft })}
          spentLabel={t('exerciseRunner.errorCorrection.selfCheck.spent')}
          left={checksLeft}
          busy={checking}
          disabled={touched === 0}
          summary={
            checked === null
              ? null
              : t('exerciseRunner.errorCorrection.selfCheck.summary', {
                  fixed: checked.fixedCount,
                  total: checked.spanCount,
                })
          }
          error={checkError}
          onPress={() => void runSelfCheck()}
        />
      ) : null}

      {audioOn ? (
        <AudioTranscript
          audio={audio.audio}
          revealed={verdict?.audioTranscript !== undefined}
          delivered={verdict?.audioTranscript ?? null}
        />
      ) : null}
    </View>
  );
}

/** Explicit branches rather than a computed key, so every name stays a checked key. */
function typeName(t: ReturnType<typeof useTranslation>['t'], type: SpanType): string {
  switch (type) {
    case 'form':
      return t('exerciseRunner.errorCorrection.type.form');
    case 'order':
      return t('exerciseRunner.errorCorrection.type.order');
    case 'extra':
      return t('exerciseRunner.errorCorrection.type.extra');
    case 'missing':
      return t('exerciseRunner.errorCorrection.type.missing');
    case 'spelling':
      return t('exerciseRunner.errorCorrection.type.spelling');
    case 'function':
      return t('exerciseRunner.errorCorrection.type.function');
  }
}

/** One sentence of a self-check: counts and types only — never which word. */
function CorrectionNote({ feedback }: { feedback: CorrectionSelfCheckItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { fixedCount, spanCount, strayEdits } = feedback;
  const left = spanCount - fixedCount;
  const headline =
    spanCount === 0
      ? t('exerciseRunner.errorCorrection.selfCheck.itemClean')
      : left === 0
        ? t('exerciseRunner.errorCorrection.selfCheck.itemAll')
        : fixedCount === 0
          ? t('exerciseRunner.errorCorrection.selfCheck.itemNone')
          : t('exerciseRunner.errorCorrection.selfCheck.itemSome', { fixed: fixedCount, total: spanCount });
  const types = (feedback.remainingTypes ?? []).filter((type): type is SpanType =>
    ['form', 'order', 'extra', 'missing', 'spelling', 'function'].includes(type),
  );
  const done = left === 0 && strayEdits === 0;
  return (
    <View style={[styles.selfCheck, { borderColor: done ? colors.success : colors.backgroundPressed }]}>
      <Text style={[styles.selfCheckHead, done && { color: colors.success }]}>{headline}</Text>
      {left > 0 ? (
        <Text style={styles.metaText}>
          {t('exerciseRunner.errorCorrection.selfCheck.remaining', { count: left })}
          {types.length > 0 ? ` — ${types.map((type) => typeName(t, type)).join(', ')}` : ''}
        </Text>
      ) : null}
      {strayEdits > 0 ? (
        <Text style={styles.metaText}>
          {t('exerciseRunner.errorCorrection.selfCheck.stray', { count: strayEdits })}
        </Text>
      ) : null}
    </View>
  );
}

function HintToggle({ hint }: { hint: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity onPress={() => setOpen((v) => !v)}>
        <Text style={styles.link}>
          {open ? t('exerciseRunner.errorCorrection.hideHint') : t('exerciseRunner.errorCorrection.showHint')}
        </Text>
      </TouchableOpacity>
      {open ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    audio: { marginBottom: 14 },
    toFind: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.accent,
      marginBottom: 6,
    },
    note: { fontSize: 13, color: colors.textSecondary, marginBottom: 8, lineHeight: 18 },
    howTo: { fontSize: 13, color: colors.textMuted, marginBottom: 10, lineHeight: 18 },
    progress: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    cardJoined: { marginTop: -8 },
    number: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
    line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6 },
    word: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      marginRight: 2,
      borderRadius: 6,
      minHeight: 32,
      justifyContent: 'center',
    },
    wordActive: { backgroundColor: colors.accentLight },
    wordText: { fontSize: 18, lineHeight: 24, color: colors.textPrimary },
    wordStruck: {
      fontSize: 18,
      lineHeight: 24,
      color: colors.textMuted,
      textDecorationLine: 'line-through',
    },
    wordFixed: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.accent },
    insertChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginRight: 4,
      borderRadius: 8,
      backgroundColor: colors.accentLight,
    },
    insertChipText: { fontSize: 17, fontWeight: '700', color: colors.accent },
    editor: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.accent,
      backgroundColor: colors.backgroundInput,
      gap: 8,
    },
    editorLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    editorInput: {
      fontSize: 18,
      color: colors.textPrimary,
      borderBottomWidth: 2,
      borderColor: colors.accent,
      paddingVertical: 6,
    },
    editorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    charKey: {
      minWidth: 40,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.backgroundPressed,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    charKeyPressed: { backgroundColor: colors.accentLight },
    charKeyText: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    primarySmall: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    primarySmallText: { fontSize: 14, fontWeight: '700', color: colors.textInverted },
    ghostSmall: {
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.backgroundPressed,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    ghostSmallText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    meta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 14,
      rowGap: 4,
      marginTop: 10,
    },
    metaText: { fontSize: 12, color: colors.textMuted },
    link: { fontSize: 13, fontWeight: '600', color: colors.accent, paddingVertical: 4 },
    selfCheck: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1.5, gap: 4 },
    selfCheckHead: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  });
