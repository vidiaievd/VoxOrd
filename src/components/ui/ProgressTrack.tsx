import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';

export interface ProgressTrackProps {
  /** 0..1, clamped. */
  value: number;
  height?: number;
  /** Fill colour token; defaults to the Nocturne accent. */
  fill?: string;
}

export function ProgressTrack({ value, height = 4, fill }: ProgressTrackProps) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.neutral800,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: fill ?? colors.accentBase,
        }}
      />
    </View>
  );
}
