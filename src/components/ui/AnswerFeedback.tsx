import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Icon, IconName } from './Icon';

export interface AnswerFeedbackProps {
  icon: IconName;
  title: string;
  /** The line under the title — the explanation, or a note on what happens next. */
  body?: string | null;
}

/**
 * The verdict above a checked answer's footer button — Courses §8.5: 15 `text` title with an
 * 18 `accent300` icon, 13/19 `neutral400` line under it. Slides up 24 and fades in over
 * 180 ms. The caller sits it on `surface` (the footer turns `surface` with it).
 */
export function AnswerFeedback({ icon, title, body }: AnswerFeedbackProps) {
  const { colors, typography } = useTheme();
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [shown]);

  const translateY = shown.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{ opacity: shown, transform: [{ translateY }], gap: 4 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={colors.accent300} />
        <Text style={[typography.cardTitle, { flex: 1, color: colors.text }]}>
          {title}
        </Text>
      </View>
      {body ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {body}
        </Text>
      ) : null}
    </Animated.View>
  );
}
