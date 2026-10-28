import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../providers/ThemeProvider';
import { radii, spacing } from '../../theme/spacing';
import { withAlpha } from './color';

export type CardVariant = 'plain' | 'lit' | 'outline';

export interface CardProps {
  variant?: CardVariant;
  /** Home uses 18, the rest 16. */
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * plain   — `surface` fill.
 * lit     — 150° gradient accent900 → surface at 70% + 1px accent800 edge.
 * outline — no fill, 1px neutral800 edge.
 */
export function Card({
  variant = 'plain',
  padding = spacing.cardPadding,
  style,
  children,
}: CardProps) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    borderRadius: radii.card,
    padding,
    overflow: 'hidden',
  };

  if (variant === 'outline') {
    return (
      <View
        style={[
          base,
          { borderWidth: 1, borderColor: colors.neutral800 },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  if (variant === 'lit') {
    return (
      <View
        style={[
          base,
          {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.accent800,
          },
          style,
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[
            withAlpha(colors.accent900, 0.7),
            withAlpha(colors.surface, 0.7),
          ]}
          // CSS 150° ≈ top-left light source running towards the bottom-right.
          start={{ x: 0.25, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }
  return (
    <View style={[base, { backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}
