import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors, typography } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 2,
        borderRadius: radii.plate,
        backgroundColor: colors.neutral900,
      }}
    >
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 32,
              borderRadius: radii.segmentOption,
              backgroundColor: active ? colors.accent800 : 'transparent',
            }}
          >
            <Text
              style={[
                typography.secondary,
                { color: active ? colors.text : colors.neutral400 },
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
