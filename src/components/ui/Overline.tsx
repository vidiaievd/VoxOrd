import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';

export function Overline({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useTheme();
  return (
    <Text style={[typography.overline, { color: colors.neutral500 }, style]}>
      {children}
    </Text>
  );
}
