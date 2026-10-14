import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useNarration } from '../../hooks/useNarration';

/** How far one press of «back» or «forward» moves, in seconds. */
const JUMP_SECONDS = 10;

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The text's narration, in a strip under the header: back 10 s, play or pause, forward 10 s,
 * where it is, and the speed. It stays put while the text scrolls under it, so the recording
 * can be followed along the page.
 */
export function NarrationBar({ mediaId }: { mediaId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, position, duration, speed, toggle, seekBy, cycleSpeed } = useNarration(mediaId);

  const started = status === 'playing' || status === 'paused';

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.jump}
        onPress={() => seekBy(-JUMP_SECONDS)}
        disabled={!started}
        accessibilityLabel={t('lessonReader.narration.back')}
      >
        <Text style={[styles.jumpText, !started && styles.dim]}>↺10</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.play}
        onPress={toggle}
        disabled={status === 'loading'}
        accessibilityLabel={
          status === 'playing' ? t('lessonReader.narration.pause') : t('lessonReader.narration.play')
        }
      >
        {status === 'loading' ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.playText}>{status === 'playing' ? '❚❚' : '▶'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.jump}
        onPress={() => seekBy(JUMP_SECONDS)}
        disabled={!started}
        accessibilityLabel={t('lessonReader.narration.forward')}
      >
        <Text style={[styles.jumpText, !started && styles.dim]}>10↻</Text>
      </TouchableOpacity>

      <Text style={styles.time} numberOfLines={1}>
        {status === 'error'
          ? t('lessonReader.narration.error')
          : started || duration > 0
            ? `${clock(position)} / ${clock(duration)}`
            : t('lessonReader.narration.label')}
      </Text>

      <TouchableOpacity
        style={styles.speed}
        onPress={cycleSpeed}
        accessibilityLabel={t('lessonReader.narration.speed')}
      >
        <Text style={styles.speedText}>{`${speed}×`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    jump: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    jumpText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    dim: {
      opacity: 0.35,
    },
    play: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 4,
    },
    playText: {
      fontSize: 15,
      color: colors.textInverted,
    },
    time: {
      flex: 1,
      marginLeft: 8,
      fontSize: 13,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    speed: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    speedText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  });
