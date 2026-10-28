import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

export type TagVariant = 'accent' | 'outline' | 'neutral';

export function Tag({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: TagVariant;
}) {
  const { colors, typography } = useTheme();
  const look = {
    accent: {
      bg: colors.accent900,
      border: colors.accent900,
      fg: colors.accent200,
    },
    outline: {
      bg: 'transparent',
      border: colors.accent700,
      fg: colors.accent300,
    },
    neutral: {
      bg: colors.neutral900,
      border: colors.neutral900,
      fg: colors.neutral400,
    },
  }[variant];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radii.tag,
        borderWidth: 1,
        backgroundColor: look.bg,
        borderColor: look.border,
      }}
    >
      <Text style={[typography.meta, { color: look.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
