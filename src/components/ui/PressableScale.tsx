import React, { ReactNode, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';

export interface PressableScaleProps
  extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Scale while pressed. Home §6.2: 0.98 over 100 ms. */
  pressedScale?: number;
}

/** Pressable that shrinks slightly while held; Android ripple in `accent800`. */
export function PressableScale({
  style,
  children,
  pressedScale = 0.98,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: 100,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      android_ripple={{ color: colors.accent800 }}
      onPressIn={(e: GestureResponderEvent) => {
        animate(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animate(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
