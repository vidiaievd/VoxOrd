import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { withAlpha } from './color';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 36 | 40 | 44 | 48 | 52;

export interface ButtonProps {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width. */
  block?: boolean;
  icon?: IconName;
  /** `fill` for a toggled state such as a saved bookmark. */
  iconWeight?: 'regular' | 'fill';
  /** Icon-only button: square, needs `accessibilityLabel`. */
  iconOnly?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Outlined only — Nocturne forbids large accent fills.
 * primary: 1px accentBase edge, accent300 text; pressed: accentBase @12% fill, accent400 edge.
 * secondary: 1px neutral700 edge, text colour.  ghost: no edge, accent300 text.
 */
export function Button({
  label,
  variant = 'primary',
  size = 48,
  block,
  icon,
  iconWeight,
  iconOnly,
  disabled,
  accessibilityLabel,
  onPress,
  style,
}: ButtonProps) {
  const { colors, typography } = useTheme();
  const [pressed, setPressed] = React.useState(false);

  const fg = variant === 'secondary' ? colors.text : colors.accent300;
  const border =
    variant === 'primary'
      ? pressed
        ? colors.accent400
        : colors.accentBase
      : variant === 'secondary'
      ? colors.neutral700
      : 'transparent';
  const bg =
    pressed && variant === 'primary'
      ? withAlpha(colors.accentBase, 0.12)
      : pressed
      ? withAlpha(colors.neutral700, 0.25)
      : 'transparent';
  const iconSize = size <= 40 ? 16 : 20;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          height: size,
          minWidth: iconOnly ? size : undefined,
          alignSelf: block ? 'stretch' : 'flex-start',
          paddingHorizontal: iconOnly ? 0 : 16,
          borderRadius: radii.plate,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Icon name={icon} size={iconSize} color={fg} weight={iconWeight} /> : null}
        {!iconOnly && label ? (
          <Text
            numberOfLines={1}
            style={[
              typography.cardTitle,
              { color: fg, fontFamily: typography.cardTitleMedium.fontFamily },
            ]}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
