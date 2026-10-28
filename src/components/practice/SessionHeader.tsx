import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Icon } from '../ui/Icon';

export interface SessionHeaderProps {
  title: string;
  /** `X` leaves a session in progress; `back` is for the screens before one starts. */
  leading?: 'close' | 'back';
  leadingLabel: string;
  onLeading: () => void;
  /** «3/18» — empty keeps the slot so the title stays centred. */
  counter?: string;
}

/**
 * The header of every session screen (Practice §5.1, «session» variant): 48 high, the
 * leaving control on the left, the title centred, a 44-wide counter slot on the right.
 */
export function SessionHeader({
  title,
  leading = 'close',
  leadingLabel,
  onLeading,
  counter,
}: SessionHeaderProps) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        height: 48,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={leadingLabel}
        onPress={onLeading}
        hitSlop={4}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={leading === 'close' ? 'X' : 'CaretLeft'}
          size={20}
          color={colors.text}
        />
      </Pressable>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          typography.cardTitle,
          { flex: 1, textAlign: 'center', color: colors.text },
        ]}
      >
        {title}
      </Text>
      <View style={{ width: 44, paddingRight: 12 }}>
        {counter ? (
          <Text
            style={{ fontSize: 12, textAlign: 'right', color: colors.neutral500 }}
          >
            {counter}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
