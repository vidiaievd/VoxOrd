import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { formatDuration } from '../../../lib/audio';
import type { ExerciseAudioEngine } from '../../../hooks/useExerciseAudio';

export interface ExerciseAudioPlayerProps {
  eng: ExerciseAudioEngine;
  /** `quiet` sits above the items; `big` fills the listen-first screen. */
  tone?: 'quiet' | 'big';
  /** False while the body is locked: everything renders, nothing responds. */
  interactive?: boolean;
}

/**
 * The player of a listening exercise — BEHAVIOR.md §5, and not the lesson player.
 *
 * What makes it a different instrument from `LessonReaderScreen/listening/AudioPlayer` is
 * the allowance: a press here may be refused, and the pips say how many listens are left
 * before it is. It decides none of that — `useExerciseAudio` holds the kernel's state
 * machine and this draws it.
 *
 * The web player's equaliser bars are not here. They are decoration that says nothing the
 * status line does not already say in words, and animating them on a phone would cost a
 * driver and a `prefers-reduced-motion` equivalent for no information.
 */
export function ExerciseAudioPlayer({
  eng,
  tone = 'quiet',
  interactive = true,
}: ExerciseAudioPlayerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const live = interactive && !eng.failed;
  const { settings } = eng.audio;
  const big = tone === 'big';
  const size = big ? 72 : 44;

  const status = eng.failed
    ? t('exerciseRunner.audio.status.failed')
    : eng.playing
    ? t('exerciseRunner.audio.status.playing')
    : eng.exhausted && !eng.canPlay
    ? t('exerciseRunner.audio.status.spent')
    : eng.state.pos > 0
    ? t('exerciseRunner.audio.status.paused')
    : t('exerciseRunner.audio.status.idle');

  return (
    <View style={[styles.card, eng.exhausted && !eng.playing && styles.cardSpent]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.button,
            { width: size, height: size, borderRadius: size / 2 },
            (!live || !eng.canPlay) && styles.buttonOff,
          ]}
          onPress={eng.toggle}
          disabled={!live || !eng.canPlay}
          accessibilityRole="button"
          accessibilityLabel={
            eng.playing ? t('exerciseRunner.audio.pause') : t('exerciseRunner.audio.play')
          }
          activeOpacity={0.8}
        >
          {eng.loading ? (
            <ActivityIndicator size="small" color={colors.textInverted} />
          ) : (
            <Text style={[styles.buttonIcon, big && styles.buttonIconBig]}>
              {eng.playing ? '❚❚' : '▶'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.main}>
          {eng.audio.title.trim() !== '' ? (
            <Text style={styles.title} numberOfLines={1}>
              {eng.audio.title}
            </Text>
          ) : null}

          <Track eng={eng} live={live} label={t('exerciseRunner.audio.position')} />

          <View style={styles.metaRow}>
            <Text style={styles.time}>
              {formatDuration(eng.state.pos)} / {formatDuration(eng.duration)}
            </Text>
            {/* The state is always in words. A colour or a moving bar says it only to
                somebody who can see it. */}
            <Text style={styles.status} numberOfLines={1} accessibilityLiveRegion="polite">
              {status}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        {settings.seek ? (
          <TouchableOpacity
            style={[styles.chip, !live && styles.chipOff]}
            onPress={eng.back}
            disabled={!live}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{t('exerciseRunner.audio.back10')}</Text>
          </TouchableOpacity>
        ) : null}

        {settings.speed ? (
          <TouchableOpacity
            style={[styles.chip, !live && styles.chipOff]}
            onPress={eng.cycleSpeed}
            disabled={!live}
            accessibilityRole="button"
            accessibilityLabel={t('exerciseRunner.audio.speedLabel')}
          >
            <Text style={styles.chipText}>
              {t('exerciseRunner.audio.speed', { rate: eng.speed })}
            </Text>
          </TouchableOpacity>
        ) : null}

        {eng.limit > 0 ? <Plays spent={eng.plays} limit={eng.limit} /> : null}
      </View>
    </View>
  );
}

/**
 * The progress bar, and a control the learner may move when the teacher allowed scrubbing.
 *
 * With `seek` off it is a progress bar and nothing else — not a disabled slider, which
 * would offer a control that is not there. With it on, a tap moves the position and the
 * screen reader's «adjustable» actions move it by five seconds, so scrubbing is not
 * pointer-only (plan 56 §3.12).
 */
function Track({
  eng,
  live,
  label,
}: {
  eng: ExerciseAudioEngine;
  live: boolean;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [width, setWidth] = useState(0);

  const seekable = eng.audio.settings.seek && live;
  const ratio = eng.duration > 0 ? Math.min(1, eng.state.pos / eng.duration) : 0;
  const band =
    eng.state.range !== null && eng.duration > 0
      ? {
          left: (eng.state.range.start / eng.duration) * 100,
          width: ((eng.state.range.end - eng.state.range.start) / eng.duration) * 100,
        }
      : null;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onPress = (event: GestureResponderEvent) => {
    if (!seekable || width === 0) return;
    eng.seekTo((event.nativeEvent.locationX / width) * eng.duration);
  };

  return (
    <TouchableOpacity
      activeOpacity={seekable ? 0.8 : 1}
      onPress={onPress}
      disabled={!seekable}
      onLayout={onLayout}
      accessibilityRole={seekable ? 'adjustable' : 'progressbar'}
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: Math.round(eng.duration),
        now: Math.round(eng.state.pos),
        text: formatDuration(eng.state.pos),
      }}
      accessibilityActions={
        seekable ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
      }
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'increment') eng.seekTo(eng.state.pos + 5);
        if (event.nativeEvent.actionName === 'decrement') eng.seekTo(eng.state.pos - 5);
      }}
      style={[styles.track, seekable && styles.trackSeekable]}
    >
      {/* The fragment being played, marked on the track it belongs to. */}
      {band !== null ? (
        <View
          style={[styles.band, { left: `${band.left}%`, width: `${band.width}%` }]}
          pointerEvents="none"
        />
      ) : null}
      <View style={[styles.fill, { width: `${ratio * 100}%` }]} pointerEvents="none" />
    </TouchableOpacity>
  );
}

/** One pip per listen the teacher allowed, spent ones greyed. */
function Plays({ spent, limit }: { spent: number; limit: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const left = Math.max(0, limit - spent);

  return (
    <View style={styles.plays}>
      <View style={styles.pips}>
        {Array.from({ length: limit }, (_, i) => (
          <View key={i} style={[styles.pip, i >= left && styles.pipSpent]} />
        ))}
      </View>
      <Text style={styles.playsText}>
        {left === 0
          ? t('exerciseRunner.audio.playsNone')
          : t('exerciseRunner.audio.playsLeft', { left, limit })}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 10,
    },
    // The whole player dims when there is nothing left to start (BEHAVIOR §5).
    cardSpent: {
      opacity: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    buttonOff: {
      opacity: 0.45,
    },
    buttonIcon: {
      color: colors.textInverted,
      fontSize: 16,
    },
    buttonIconBig: {
      fontSize: 26,
    },
    main: {
      flex: 1,
      gap: 6,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.backgroundInput,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    trackSeekable: {
      height: 10,
      borderRadius: 5,
    },
    band: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: colors.accentLight,
    },
    fill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: colors.accent,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    time: {
      fontSize: 11.5,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    status: {
      flex: 1,
      fontSize: 11.5,
      color: colors.textMuted,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    chipOff: {
      opacity: 0.45,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    plays: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginLeft: 'auto',
    },
    pips: {
      flexDirection: 'row',
      gap: 4,
    },
    pip: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    pipSpent: {
      backgroundColor: colors.border,
    },
    playsText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
  });
