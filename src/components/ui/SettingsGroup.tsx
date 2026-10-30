import React, { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { Overline } from './Overline';

export interface SettingsGroupProps {
  title?: string;
  /** Small print under the card. */
  note?: string;
  children?: ReactNode;
}

/** Titled card holding `SettingsRow`s; the first row passes `isFirst`. */
export function SettingsGroup({ title, note, children }: SettingsGroupProps) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Overline style={{ paddingHorizontal: 2 }}>{title}</Overline>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {note ? (
        <Text
          style={[
            typography.meta,
            { color: colors.neutral500, lineHeight: 17, paddingHorizontal: 2 },
          ]}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
