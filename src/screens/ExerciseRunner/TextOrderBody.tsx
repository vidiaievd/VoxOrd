import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import type { ExerciseBodyProps } from './ExerciseBody';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import {
  buildTextOrderAnswer,
  moveLine,
  placedFromScore,
  readTextOrderTask,
  shuffleOrder,
} from './templates/textOrder';

/**
 * `text_order` — the lines of a text or a dialogue, dealt out shuffled, to be put back in order.
 *
 * Two ways to move a line, because eight lines by arrows alone is a lot of tapping: the arrows
 * beside it, or tap it and then tap the place it belongs. Any arrangement can be checked — the
 * footer's Check sends the order, and the verdict comes back as right or as how many lines sit
 * in their own place (the engine does not say which).
 */
export function TextOrderBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const task = useMemo(() => readTextOrderTask(display.content), [display.content]);
  const byId = useMemo(() => new Map(task.lines.map((line) => [line.id, line])), [task]);
  // Seeded by the exercise id, as on the web: the same puzzle on both, and on every reopen.
  const [order, setOrder] = useState<string[]>(() =>
    shuffleOrder(
      task.lines.map((line) => line.id),
      display.id,
    ),
  );
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    onAnswerChange(buildTextOrderAnswer(order), order.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const locked = disabled || (audioOn && audio.gated);

  useEffect(() => {
    if (locked) setSelected(null);
  }, [locked]);

  const move = (from: number, to: number) => {
    setOrder((prev) => moveLine(prev, from, to));
    setSelected(null);
  };

  const press = (index: number) => {
    if (locked) return;
    if (selected === null) setSelected(index);
    else if (selected === index) setSelected(null);
    else move(selected, index);
  };

  const placed = verdict !== null && !verdict.correct ? placedFromScore(verdict.score, order.length) : null;

  return (
    <View>
      {audioOn ? (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audio.gated ? <AudioLockNote itemNoun={t('exerciseRunner.audio.itemNoun.lines')} /> : null}
        </View>
      ) : null}

      {task.context !== '' ? <Text style={styles.context}>{task.context}</Text> : null}
      {!disabled ? (
        <Text style={styles.howTo}>
          {selected === null
            ? t('exerciseRunner.textOrder.howTo')
            : t('exerciseRunner.textOrder.pickPlace')}
        </Text>
      ) : null}

      {order.map((id, index) => {
        const line = byId.get(id);
        if (line === undefined) return null;
        const isSelected = selected === index;
        const target = selected !== null && !isSelected;
        return (
          <View
            key={id}
            style={[
              styles.line,
              isSelected && styles.lineSelected,
              target && styles.lineTarget,
              verdict?.correct === true && styles.lineRight,
            ]}
          >
            <TouchableOpacity
              style={styles.lineBody}
              onPress={() => press(index)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={t('exerciseRunner.textOrder.lineLabel', {
                n: index + 1,
                text: line.text,
              })}
            >
              <Text style={styles.position}>{index + 1}</Text>
              <Text style={styles.text}>
                {line.speaker !== undefined ? <Text style={styles.speaker}>{line.speaker}: </Text> : null}
                {line.text}
              </Text>
            </TouchableOpacity>
            {!disabled ? (
              <View style={styles.arrows}>
                <TouchableOpacity
                  style={[styles.arrow, index === 0 && styles.arrowOff]}
                  onPress={() => move(index, index - 1)}
                  disabled={locked || index === 0}
                  accessibilityLabel={t('exerciseRunner.textOrder.up')}
                >
                  <Text style={styles.arrowText}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arrow, index === order.length - 1 && styles.arrowOff]}
                  onPress={() => move(index, index + 1)}
                  disabled={locked || index === order.length - 1}
                  accessibilityLabel={t('exerciseRunner.textOrder.down')}
                >
                  <Text style={styles.arrowText}>↓</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      {placed !== null ? (
        <Text style={styles.result}>
          {t('exerciseRunner.textOrder.placed', { placed, total: order.length })}
        </Text>
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

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    audio: { marginBottom: 14 },
    context: { fontSize: 13, fontWeight: '500', color: colors.neutral400, marginBottom: 6 },
    howTo: { fontSize: 13, color: colors.neutral500, marginBottom: 12, lineHeight: 18 },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
      marginBottom: 8,
      paddingLeft: 12,
      paddingRight: 6,
    },
    lineSelected: { borderColor: colors.accentBase, backgroundColor: colors.accent900 },
    lineTarget: { borderColor: colors.neutral800, borderStyle: 'dashed' },
    lineRight: { borderColor: colors.accentBase },
    lineBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 10 },
    position: { fontSize: 13, fontWeight: '500', color: colors.neutral500, minWidth: 18, marginTop: 2 },
    text: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.text },
    speaker: { fontWeight: '500' },
    arrows: { gap: 4, paddingVertical: 6 },
    arrow: {
      width: 40,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.neutral800,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowOff: { opacity: 0.3 },
    arrowText: { fontSize: 18, fontWeight: '500', color: colors.text },
    result: { fontSize: 14, fontWeight: '500', color: colors.neutral400, marginTop: 6 },
  });
