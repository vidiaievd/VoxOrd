import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { NarrationController } from '../../hooks/useNarration';
import { Button, ProgressTrack } from '../../components/ui';
import { radii } from '../../theme/spacing';

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The text's narration, in a block under the header: play or pause, where it is, and the
 * speed. It stays put while the text scrolls under it, so the recording can be followed along
 * the page. The controller is the screen's, which also reads the position to colour the
 * paragraphs. Tapping the track jumps there — it replaces the old ±10 s buttons, which the
 * redesign has no room for.
 */
export function NarrationBar({ narration }: { narration: NarrationController }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { status, position, duration, speed, toggle, seekBy, cycleSpeed } = narration;
  const [trackWidth, setTrackWidth] = useState(0);

  const started = status === 'playing' || status === 'paused';
  const known = duration > 0;

  const seekToTouch = (x: number) => {
    if (!started || !known || trackWidth <= 0) return;
    const to = Math.min(1, Math.max(0, x / trackWidth)) * duration;
    seekBy(to - position);
  };

  return (
    <View
      style={{
        marginHorizontal: 18,
        marginBottom: 4,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radii.plate,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Button
        variant="secondary"
        size={36}
        iconOnly
        icon={status === 'playing' ? 'Pause' : 'Play'}
        disabled={status === 'loading'}
        accessibilityLabel={
          status === 'playing' ? t('lessonReader.narration.pause') : t('lessonReader.narration.play')
        }
        onPress={toggle}
      />

      <View style={{ flex: 1, gap: 6 }}>
        {status === 'error' ? (
          <Text style={[typography.meta, { color: colors.neutral400 }]}>
            {t('lessonReader.narration.error')}
          </Text>
        ) : (
          <>
            <Pressable
              accessibilityLabel={t('lessonReader.narration.label')}
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => seekToTouch(e.nativeEvent.locationX)}
              // The track is 3 high: the touch area is taller than what is drawn.
              style={{ paddingVertical: 6 }}
            >
              <View pointerEvents="none">
                <ProgressTrack
                  value={known ? position / duration : 0}
                  height={3}
                  fill={colors.accent300}
                />
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: colors.neutral500, fontVariant: ['tabular-nums'] }}>
                {clock(position)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.neutral500, fontVariant: ['tabular-nums'] }}>
                {known ? clock(duration) : t('lessonReader.narration.label')}
              </Text>
            </View>
          </>
        )}
      </View>

      <Pressable
        onPress={cycleSpeed}
        accessibilityRole="button"
        accessibilityLabel={t('lessonReader.narration.speed')}
        hitSlop={8}
      >
        <Text style={{ fontSize: 12, color: colors.neutral300 }}>{`${speed}×`}</Text>
      </Pressable>
    </View>
  );
}
