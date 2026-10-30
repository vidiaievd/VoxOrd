import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';

export interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Nocturne switch, 46×28. The track colour changes at once, only the knob slides. */
export function Toggle({
  value,
  onChange,
  disabled,
  accessibilityLabel,
}: ToggleProps) {
  const { colors } = useTheme();
  const x = useRef(new Animated.Value(value ? 18 : 0)).current;

  useEffect(() => {
    Animated.timing(x, {
      toValue: value ? 18 : 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [value, x]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
    >
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          padding: 3,
          borderWidth: 1,
          backgroundColor: value ? colors.accent800 : colors.neutral900,
          borderColor: value ? colors.accentBase : colors.neutral700,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: value ? colors.accentBase : colors.neutral500,
            transform: [{ translateX: x }],
          }}
        />
      </View>
    </Pressable>
  );
}
