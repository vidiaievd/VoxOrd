import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import type { ExerciseBodyProps } from './ExerciseBody';
import { AudioLockNote, ExerciseAudioPlayer } from './audio';
import { selfCheck } from '../../api/exercises';
import { SelfCheckButton } from './SelfCheckButton';
import {
  readTranslateSelfCheck,
  selfCheckBudget,
  type TranslateSelfCheck,
  type TranslateSelfCheckItem,
} from './templates/selfCheck';
import {
  buildTranslateAnswer,
  readTranslateRouting,
  readTranslateTask,
  translateCanSubmit,
  type TranslateItem,
  type TranslateRouting,
} from './templates/translate';

/** The letters a Norwegian answer needs and most phone layouts hide — `flow.keyboard`. */
const NORWEGIAN_CHARS = ['æ', 'ø', 'å'] as const;

/**
 * `translate_to_target` / `translate_from_target` — a set of sentences, one hand-in, as the web
 * runner plays them (plan 42).
 *
 * The body says little after hand-in, on purpose: the engine may only ever approve. A sentence
 * that hits a variant of the key closes on its own, everything else waits for a teacher — a
 * translation that misses the key is very often a second good one, so nothing here calls an
 * answer wrong. The footer's Check sends every sentence at once.
 */
export function TranslateBody({
  display,
  disabled,
  verdict,
  onAnswerChange,
  openAttempt,
}: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const task = useMemo(
    () => readTranslateTask(display.content, display.templateCode),
    [display.content, display.templateCode],
  );
  const [values, setValues] = useState<Record<string, string>>({});

  // The self-check: how close the work is before it goes to a teacher, on the author's budget.
  const [checked, setChecked] = useState<TranslateSelfCheck | null>(null);
  const [checksLeft, setChecksLeft] = useState(() => selfCheckBudget(display.content));
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const runSelfCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const attemptId = await openAttempt();
      const read = readTranslateSelfCheck(
        await selfCheck(display.id, attemptId, buildTranslateAnswer(task.items, values)),
      );
      setChecked(read);
      setChecksLeft(read.checksLeft);
    } catch {
      setCheckError(t('exerciseRunner.translate.selfCheck.failed'));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    onAnswerChange(buildTranslateAnswer(task.items, values), translateCanSubmit(task.items, values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, values]);

  const routing = useMemo(() => readTranslateRouting(verdict?.details), [verdict]);
  const written = task.items.filter((item) => (values[item.id] ?? '').trim() !== '').length;
  const numbered = task.items.length > 1;
  const mixed = task.dir === 'both';

  const heading = mixed
    ? t('exerciseRunner.translate.bothWays')
    : t('exerciseRunner.translate.direction', {
        from: task.items[0]?.sourceLang ?? task.langs.explain,
        to: task.items[0]?.answerLang ?? task.langs.target,
      });

  return (
    <View>
      <Text style={styles.heading}>{heading}</Text>
      {task.note !== '' && !disabled ? <Text style={styles.note}>{task.note}</Text> : null}

      {numbered ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${(written / task.items.length) * 100}%` }]}
            />
          </View>
          <Text style={styles.progressText}>
            {t('exerciseRunner.translate.progress', { written, total: task.items.length })}
          </Text>
        </View>
      ) : null}

      {task.items.map((item, index) => (
        <TranslateCard
          key={item.id}
          item={item}
          content={display.content}
          number={numbered ? index + 1 : null}
          showDirection={mixed}
          showGloss={task.gloss}
          keyboard={task.keyboard}
          value={values[item.id] ?? ''}
          disabled={disabled}
          outcome={routing[item.id] ?? null}
          feedback={disabled ? null : checked?.items[item.id] ?? null}
          onChange={(text) => setValues((prev) => ({ ...prev, [item.id]: text }))}
        />
      ))}

      {!disabled && selfCheckBudget(display.content) > 0 ? (
        <SelfCheckButton
          label={t('exerciseRunner.translate.selfCheck.button', { left: checksLeft })}
          spentLabel={t('exerciseRunner.translate.selfCheck.spent')}
          left={checksLeft}
          busy={checking}
          disabled={written === 0}
          summary={
            checked === null
              ? null
              : t('exerciseRunner.translate.selfCheck.summary', {
                  passing: checked.passing,
                  total: task.items.length,
                })
          }
          error={checkError}
          onPress={() => void runSelfCheck()}
        />
      ) : null}
    </View>
  );
}

interface TranslateCardProps {
  item: TranslateItem;
  /** The exercise's own document — its `audio` block carries the listening rules. */
  content: unknown;
  /** Null for a single sentence, where a number would only be furniture. */
  number: number | null;
  showDirection: boolean;
  showGloss: boolean;
  keyboard: boolean;
  value: string;
  disabled: boolean;
  outcome: TranslateRouting | null;
  /** This sentence in the last self-check, while the work is still open. */
  feedback: TranslateSelfCheckItem | null;
  onChange: (text: string) => void;
}

function TranslateCard({
  item,
  content,
  number,
  showDirection,
  showGloss,
  keyboard,
  value,
  disabled,
  outcome,
  feedback,
  onChange,
}: TranslateCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [hintOpen, setHintOpen] = useState(false);
  const selection = useRef({ start: value.length, end: value.length });

  const label =
    number === null
      ? showDirection
        ? t('exerciseRunner.translate.direction', { from: item.sourceLang, to: item.answerLang })
        : item.sourceLang
      : showDirection
        ? t('exerciseRunner.translate.numberedDirection', {
            n: number,
            from: item.sourceLang,
            to: item.answerLang,
          })
        : t('exerciseRunner.translate.numberedLang', { n: number, lang: item.sourceLang });

  // Insert where the caret is, not at the end: the letter is usually missing mid-word.
  const insert = (char: string) => {
    const { start, end } = selection.current;
    const at = Math.min(start, value.length);
    const next = value.slice(0, at) + char + value.slice(Math.min(end, value.length));
    selection.current = { start: at + char.length, end: at + char.length };
    onChange(next);
  };

  return (
    <View style={[styles.card, outcome === 'pass' && { borderColor: colors.success }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>{label}</Text>
        {outcome !== null ? (
          <Text
            style={[
              styles.outcome,
              { color: outcome === 'pass' ? colors.success : colors.textSecondary },
            ]}
          >
            {outcome === 'pass'
              ? t('exerciseRunner.translate.itemApproved')
              : t('exerciseRunner.translate.itemWithTeacher')}
          </Text>
        ) : null}
      </View>

      <Text style={styles.source}>{item.source}</Text>

      {/* The author's word notes go with the reading, so they close at hand-in. */}
      {showGloss && item.gloss.length > 0 && !disabled ? (
        <View style={styles.glossRow}>
          {item.gloss.map((entry, index) => (
            <Text key={index} style={styles.gloss}>
              <Text style={styles.glossWord}>{entry.w}</Text> — {entry.t}
            </Text>
          ))}
        </View>
      ) : null}

      {item.mediaId !== undefined && !disabled ? (
        <SentenceAudio content={content} mediaId={item.mediaId}>
          {(gated) => (
            <AnswerField
              value={value}
              disabled={disabled || gated}
              placeholder={t('exerciseRunner.translate.placeholder', {
                lang: item.answerLang.toLowerCase(),
              })}
              onChange={onChange}
              onSelection={(range) => {
                selection.current = range;
              }}
            />
          )}
        </SentenceAudio>
      ) : (
        <AnswerField
          value={value}
          disabled={disabled}
          placeholder={t('exerciseRunner.translate.placeholder', {
            lang: item.answerLang.toLowerCase(),
          })}
          onChange={onChange}
          onSelection={(range) => {
            selection.current = range;
          }}
        />
      )}

      {!disabled ? (
        <View style={styles.tools}>
          {/* Only under an answer written in the target language: on the way out of it
              the letters have no use. */}
          {keyboard && item.dir === 'to_target'
            ? NORWEGIAN_CHARS.map((char) => (
                <Pressable
                  key={char}
                  style={({ pressed }) => [styles.charKey, pressed && styles.charKeyPressed]}
                  onPress={() => insert(char)}
                  accessibilityLabel={char}
                >
                  <Text style={styles.charKeyText}>{char}</Text>
                </Pressable>
              ))
            : null}
          {item.hint !== undefined ? (
            <Pressable onPress={() => setHintOpen((open) => !open)} style={styles.hintToggle}>
              <Text style={styles.hintToggleText}>
                {hintOpen
                  ? t('exerciseRunner.translate.hideHint')
                  : t('exerciseRunner.translate.showHint')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {hintOpen && item.hint !== undefined && !disabled ? (
        <Text style={styles.hint}>{item.hint}</Text>
      ) : null}

      {feedback !== null ? <SelfCheckNote feedback={feedback} /> : null}
    </View>
  );
}

/**
 * One sentence of a self-check: the verdict in words, the diff with the key's own words already
 * masked on the server, and the task's rules this answer breaks. Never a word of the key.
 */
function SelfCheckNote({ feedback }: { feedback: TranslateSelfCheckItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const headline =
    feedback.verdict === 'exact'
      ? t('exerciseRunner.translate.selfCheck.exact')
      : feedback.verdict === 'typo'
        ? t('exerciseRunner.translate.selfCheck.typo')
        : feedback.verdict === 'near'
          ? t('exerciseRunner.translate.selfCheck.near')
          : feedback.verdict === 'noref'
            ? t('exerciseRunner.translate.selfCheck.noKey')
            : feedback.verdict === 'empty'
              ? t('exerciseRunner.translate.selfCheck.empty')
              : feedback.divergingWords !== undefined
                ? t('exerciseRunner.translate.selfCheck.diverging', { count: feedback.divergingWords })
                : t('exerciseRunner.translate.selfCheck.off');
  const good = feedback.verdict === 'exact' || feedback.verdict === 'typo';
  return (
    <View style={[styles.selfCheck, { borderColor: good ? colors.success : colors.backgroundPressed }]}>
      <Text style={[styles.selfCheckHead, good && { color: colors.success }]}>{headline}</Text>
      {feedback.tokens !== undefined && feedback.tokens.length > 0 && !good ? (
        <Text style={styles.diff}>
          {feedback.tokens.map((token, index) => (
            <Text
              key={index}
              style={
                token.t === 'extra'
                  ? styles.diffExtra
                  : token.t === 'missing'
                    ? styles.diffMissing
                    : token.typo !== null
                      ? styles.diffTypo
                      : undefined
              }
            >
              {index > 0 ? ' ' : ''}
              {token.w}
            </Text>
          ))}
        </Text>
      ) : null}
      {feedback.missing.map((guard, index) => (
        <Text key={`m${index}`} style={styles.guard}>
          {t('exerciseRunner.translate.selfCheck.requires', { text: guard.text })}
          {guard.note ? ` — ${guard.note}` : ''}
        </Text>
      ))}
      {feedback.banned.map((guard, index) => (
        <Text key={`b${index}`} style={styles.guard}>
          {t('exerciseRunner.translate.selfCheck.avoid', { text: guard.text })}
          {guard.note ? ` ${guard.note}` : ''}
        </Text>
      ))}
    </View>
  );
}

/**
 * A sentence's own recording. One player per sentence — "two plays" means two plays of this
 * sentence, and the gate locks this field only. Mounted only where there is a recording, so
 * a set without audio asks media-service nothing.
 */
function SentenceAudio({
  content,
  mediaId,
  children,
}: {
  content: unknown;
  mediaId: string;
  children: (gated: boolean) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const audioContent = useMemo(() => {
    const doc = typeof content === 'object' && content !== null ? (content as Record<string, unknown>) : {};
    const block =
      typeof doc.audio === 'object' && doc.audio !== null ? (doc.audio as Record<string, unknown>) : {};
    return { audio: { ...block, enabled: true, source: 'asset', assetId: mediaId } };
  }, [content, mediaId]);
  const audio = useExerciseAudio(audioContent);

  return (
    <View>
      <ExerciseAudioPlayer eng={audio} />
      {audio.gated ? (
        <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.sentence')} own />
      ) : null}
      {children(audio.gated)}
    </View>
  );
}

function AnswerField({
  value,
  disabled,
  placeholder,
  onChange,
  onSelection,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (text: string) => void;
  onSelection: (range: { start: number; end: number }) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <TextInput
      style={[styles.input, disabled && styles.inputLocked]}
      value={value}
      onChangeText={onChange}
      onSelectionChange={(event) => onSelection(event.nativeEvent.selection)}
      editable={!disabled}
      multiline
      autoCapitalize="sentences"
      // The keyboard's own corrector "fixes" a Norwegian answer into the phone's language.
      autoCorrect={false}
      spellCheck={false}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
    />
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    heading: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    note: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 18,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.backgroundPressed,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    progressText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.backgroundPressed,
      padding: 14,
      marginBottom: 14,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      flexShrink: 1,
    },
    outcome: {
      fontSize: 12,
      fontWeight: '600',
    },
    source: {
      fontSize: 19,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 27,
      marginBottom: 8,
    },
    glossRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 12,
      rowGap: 4,
      marginBottom: 10,
    },
    gloss: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    glossWord: {
      fontWeight: '700',
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: colors.textPrimary,
      minHeight: 76,
      textAlignVertical: 'top',
      marginTop: 4,
    },
    inputLocked: {
      borderColor: colors.backgroundPressed,
    },
    tools: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    charKey: {
      minWidth: 40,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.backgroundPressed,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    charKeyPressed: {
      backgroundColor: colors.accentLight,
    },
    charKeyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    hintToggle: {
      marginLeft: 'auto',
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    hintToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    selfCheck: {
      marginTop: 10,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      gap: 4,
    },
    selfCheckHead: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    diff: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
    diffExtra: { color: colors.danger, textDecorationLine: 'line-through' },
    diffMissing: { color: colors.accent, fontWeight: '700' },
    diffTypo: { textDecorationLine: 'underline', textDecorationColor: colors.warning },
    guard: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    hint: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 8,
    },
  });
