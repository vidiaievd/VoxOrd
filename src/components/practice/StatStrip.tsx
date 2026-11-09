import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

export interface StatStripItem {
  value: string;
  label: string;
  /** Draws the value in `accent300` — the third figure of a session («hard»). */
  accent?: boolean;
}

/**
 * The plate of three figures (Practice §7.5, §8.1): a surface, columns split by a hairline,
 * the number above and its caption below.
 */
export function StatStrip({ items }: { items: readonly StatStripItem[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        paddingVertical: 14,
      }}
    >
      {items.map((item, i) => (
        <View
          key={`${item.label}-${i}`}
          accessible
          accessibilityLabel={`${item.value} ${item.label}`}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: 2,
            borderLeftWidth: i === 0 ? 0 : 1,
            borderLeftColor: colors.neutral800,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '500',
              color: item.accent ? colors.accent300 : colors.text,
            }}
          >
            {item.value}
          </Text>
          <Text style={{ fontSize: 12, color: colors.neutral500 }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
