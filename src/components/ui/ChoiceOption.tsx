import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { AnswerState, answerTone } from './answerTone';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

export interface ChoiceOptionProps {
  label: string;
  state: AnswerState;
  onPress?: () => void;
  disabled?: boolean;
  /** `radio` for one-of-many (the default), `checkbox` for a multi-select. */
  role?: 'radio' | 'checkbox';
  style?: StyleProp<ViewStyle>;
}

/**
 * One answer option — Courses §8.5: 56 high (grows with a long label), radius 8, padding
 * 0/16, a 1px edge, 17 text and an 18 icon on the right once checked. Colours by
 * `answerTone`; the icon is there so colour is never the only signal.
 */
export function ChoiceOption({
  label,
  state,
  onPress,
  disabled,
  role = 'radio',
  style,
}: ChoiceOptionProps) {
  const { colors, typography } = useTheme();
  const tone = answerTone(colors, state);
  const chosen = state === 'selected' || state === 'right' || state === 'wrong';

  return (
    <PressableScale
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: chosen, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          minHeight: 56,
          borderRadius: radii.plate,
          borderWidth: 1,
          borderColor: tone.border,
          backgroundColor: tone.bg,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        style,
      ]}
    >
      <Text
        style={[
          typography.cardTitle,
          { flex: 1, fontSize: 17, lineHeight: 24, color: tone.fg },
        ]}
      >
        {label}
      </Text>
      {tone.icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no">
          <Icon name={tone.icon} size={18} color={tone.iconColor} />
        </View>
      ) : null}
    </PressableScale>
  );
}
