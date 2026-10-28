import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Icon, IconName } from './Icon';
import { Spinner } from './Spinner';

export interface NavHeaderProps {
  /** Label of the parent screen, shown beside the arrow. */
  parentLabel: string;
  onBack: () => void;
  right?: {
    icon: IconName;
    accessibilityLabel: string;
    onPress: () => void;
    /** Shows a turning spinner instead of the icon. */
    spinning?: boolean;
  };
}

/** 48 high, no bottom border; the screen's title lives in the body, not here. */
export function NavHeader({ parentLabel, onBack, right }: NavHeaderProps) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        height: 48,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={parentLabel}
        onPress={onBack}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="CaretLeft" size={20} color={colors.text} />
        </View>
        <Text
          style={[typography.cardTitle, { color: colors.neutral400 }]}
          numberOfLines={1}
        >
          {parentLabel}
        </Text>
      </Pressable>
      {right ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={right.accessibilityLabel}
          onPress={right.onPress}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {right.spinning ? (
            <Spinner size={20} color={colors.text} />
          ) : (
            <Icon name={right.icon} size={20} color={colors.text} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
