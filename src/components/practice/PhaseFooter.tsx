import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { AnswerFeedback, type AnswerFeedbackProps } from '../ui/AnswerFeedback';

export interface PhaseFooterProps {
  /** The verdict once an answer is checked — the footer turns `surface` with it. */
  feedback?: AnswerFeedbackProps | null;
  /** Over the keyboard the safe-area inset is the keyboard's business. */
  keyboardShown?: boolean;
  children: React.ReactNode;
}

/**
 * The bottom of a review phase (Practice §7.3): padding 14/20 plus the home-indicator inset,
 * the verdict above the button after a check, on `surface`.
 */
export function PhaseFooter({ feedback, keyboardShown, children }: PhaseFooterProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: 14,
        paddingHorizontal: 20,
        paddingBottom: 14 + (keyboardShown ? 0 : insets.bottom),
        gap: 12,
        backgroundColor: feedback ? colors.surface : 'transparent',
      }}
    >
      {feedback ? <AnswerFeedback {...feedback} /> : null}
      {children}
    </View>
  );
}
