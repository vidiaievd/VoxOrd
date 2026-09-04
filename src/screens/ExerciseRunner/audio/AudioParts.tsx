import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { formatDuration, type ExerciseAudio, type ItemAudio } from '../../../lib/audio';
import type { ExerciseAudioEngine } from '../../../hooks/useExerciseAudio';
import { ExerciseAudioPlayer } from './ExerciseAudioPlayer';

/**
 * The listen-first screen — BEHAVIOR.md §4, and on a phone it is the whole screen.
 *
 * `layout: 'gate'` fills the body with this instead of the items. With `gate: 'first'`
 * the way through is locked until one complete listen; with `gate: 'none'` it is a
 * framing device and the button is live from the start. There is no way back to it once
 * entered: the compact player above the items carries the same controls.
 */
export function AudioGateScreen({
  eng,
  interactive = true,
  onStart,
}: {
  eng: ExerciseAudioEngine;
  interactive?: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const locked = eng.gated;

  return (
    <View style={styles.gate}>
      <Text style={styles.gateTitle}>
        {eng.audio.title.trim() === ''
          ? t('exerciseRunner.audio.gate.title')
          : eng.audio.title}
      </Text>
      <Text style={styles.gateLede}>
        {locked
          ? t('exerciseRunner.audio.gate.ledeLocked')
          : t('exerciseRunner.audio.gate.ledeOpen')}
      </Text>

      <View style={styles.gatePlayer}>
        <ExerciseAudioPlayer eng={eng} tone="big" interactive={interactive} />
      </View>

      <TouchableOpacity
        style={[styles.gateButton, (!interactive || locked) && styles.gateButtonOff]}
        onPress={onStart}
        disabled={!interactive || locked}
        accessibilityRole="button"
        activeOpacity={0.85}
      >
        <Text style={styles.gateButtonText}>
          {locked
            ? t('exerciseRunner.audio.gate.listenFirst')
            : t('exerciseRunner.audio.gate.toItems')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Why the items are not answering yet — BEHAVIOR.md §7. */
export function AudioLockNote({ itemNoun, own = false }: { itemNoun?: string; own?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // `own` is the per-item source (plan 56 phase 6): the clip belongs to this one item,
  // so the sentence is about it and not about "the clip" of the exercise.
  const text =
    itemNoun === undefined
      ? t('exerciseRunner.audio.lockNote')
      : own
      ? t('exerciseRunner.audio.lockNoteOwn', { item: itemNoun })
      : t('exerciseRunner.audio.lockNoteNamed', { items: itemNoun });

  return (
    <Text style={styles.lockNote} accessibilityLiveRegion="polite">
      🔒 {text}
    </Text>
  );
}

/**
 * "Play 0:22–0:48" — BEHAVIOR.md §8.
 *
 * Free, always: a fragment spends no listen and completes no playthrough, so a learner
 * who needs one line of a dialogue five times may have it. Disabled while the gate is
 * shut, because a fragment before the whole clip is the shortcut the gate exists to
 * prevent.
 */
export function AudioSegmentButton({
  eng,
  segment,
  disabled = false,
}: {
  eng: ExerciseAudioEngine;
  segment: ItemAudio | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (segment === null) return null;

  const active =
    eng.state.range !== null &&
    eng.state.range.start === segment.start &&
    eng.state.range.end === segment.end;
  const off = disabled || eng.failed;

  return (
    <TouchableOpacity
      style={[styles.fragment, active && styles.fragmentActive, off && styles.fragmentOff]}
      onPress={() =>
        active && eng.playing ? eng.toggle() : eng.playRange(segment.start, segment.end)
      }
      disabled={off}
      accessibilityRole="button"
      activeOpacity={0.8}
    >
      <Text style={[styles.fragmentText, active && styles.fragmentTextActive]}>
        {active && eng.playing ? '■ ' : '▶ '}
        {t('exerciseRunner.audio.fragment', {
          from: formatDuration(segment.start),
          to: formatDuration(segment.end),
        })}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * What the clip said — BEHAVIOR.md §9.
 *
 * Three policies, and this component sees only two of them, because the third is not a
 * matter of display: under `never`, and before the reveal under `after`, the words are
 * not on the device at all (plan 56 §3.3). `always` is shown from the start and stays
 * readable behind a closed gate — it is the path for a learner who cannot rely on
 * hearing the clip, and gating it would gate them out of the exercise.
 */
export function AudioTranscript({
  audio,
  revealed = false,
  /** The words the server owed and delivered with the key, when the policy is `after`. */
  delivered,
}: {
  audio: ExerciseAudio;
  revealed?: boolean;
  delivered?: { transcript: string; translation: string } | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);

  const policy = audio.settings.transcriptWhen;
  const words = policy === 'always' ? audio : revealed ? delivered : null;

  if (!audio.enabled || policy === 'never') return null;
  if (!words || words.transcript.trim() === '') return null;

  return (
    <View style={styles.transcript}>
      <TouchableOpacity
        onPress={() => setOpen(v => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        activeOpacity={0.8}
      >
        <Text style={styles.transcriptToggle}>
          {open ? '▾ ' : '▸ '}
          {t('exerciseRunner.audio.transcript')}
        </Text>
      </TouchableOpacity>

      {open ? (
        <View style={styles.transcriptBody}>
          <Text style={styles.transcriptText}>{words.transcript}</Text>
          {words.translation.trim() !== '' ? (
            <Text style={styles.transcriptTranslation}>{words.translation}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    gate: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 8,
      gap: 12,
    },
    gateTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    gateLede: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    gatePlayer: {
      alignSelf: 'stretch',
      marginTop: 4,
    },
    gateButton: {
      marginTop: 4,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 22,
      backgroundColor: colors.accent,
    },
    gateButtonOff: {
      opacity: 0.5,
    },
    gateButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    lockNote: {
      marginTop: 8,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    fragment: {
      alignSelf: 'flex-start',
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    fragmentActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    fragmentOff: {
      opacity: 0.45,
    },
    fragmentText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    fragmentTextActive: {
      color: colors.accent,
    },
    transcript: {
      marginTop: 12,
    },
    transcriptToggle: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    transcriptBody: {
      marginTop: 8,
      borderRadius: 12,
      backgroundColor: colors.backgroundInput,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    transcriptText: {
      fontSize: 14,
      lineHeight: 23,
      color: colors.textSecondary,
    },
    transcriptTranslation: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textMuted,
    },
  });
