import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Tag } from '../../components/ui';
import { Word } from '../../db/words';
import { SwipeDirection } from '../../hooks/useCard';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const MAX_TILT_DEG = 8;

export const CARD_WIDTH = 300;
export const CARD_HEIGHT = 420;

export interface FlipCardHandle {
  /** The accessible alternative to the gesture: throws the card off like a swipe would. */
  swipe: (direction: SwipeDirection) => void;
}

interface FlipCardProps {
  word: Word;
  onSwipe: (direction: SwipeDirection) => void;
  onFlip: () => void;
  requireFlip?: boolean; // if true — swipe blocked until card is flipped
}

/**
 * The active card of the self-assessment stack (Practice §8.2): the word, a tap shows the
 * translation under a hairline, a swipe past the threshold decides. While dragged the card
 * tilts up to ±8° and a tag — «I know» to the right, «Repeat» to the left — appears in its
 * corner; the right edge also turns `accent700`.
 */
export const FlipCard = forwardRef<FlipCardHandle, FlipCardProps>(function FlipCard(
  { word, onSwipe, onFlip, requireFlip },
  ref,
) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();

  const [isFlipped, setIsFlipped] = useState(false);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const flip = useCallback(() => {
    if (!isFlipped) onFlip();
    setIsFlipped(prev => !prev);
  }, [isFlipped, onFlip]);

  const handleSwipe = useCallback(
    (direction: SwipeDirection) => {
      'worklet';
      const toX =
        direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

      translateX.value = withTiming(toX, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 }, () => {
        'worklet';
        scheduleOnRN(onSwipe, direction);
        translateX.value = 0;
        opacity.value = 1;
      });
    },
    [onSwipe, translateX, opacity],
  );

  useImperativeHandle(
    ref,
    () => ({
      swipe: direction => {
        if (requireFlip && !isFlipped) return;
        handleSwipe(direction);
      },
    }),
    [handleSwipe, requireFlip, isFlipped],
  );

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      // Block drag if flip is required and card not yet flipped
      if (requireFlip && !isFlipped) return;
      translateX.value = e.translationX;
    })
    .onEnd(e => {
      if (requireFlip && !isFlipped) return;
      if (e.translationX > SWIPE_THRESHOLD) {
        handleSwipe('right');
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        handleSwipe('left');
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
          [-MAX_TILT_DEG, 0, MAX_TILT_DEG],
          'clamp',
        )}deg`,
      },
    ],
    opacity: opacity.value,
  }));

  const tagRightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
  }));
  const tagLeftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], 'clamp'),
  }));
  const edgeStyle = useAnimatedStyle(() => ({
    borderColor: translateX.value > 8 ? colors.accent700 : 'transparent',
  }));

  const meta = [word.partOfSpeech, word.gender].filter(Boolean).join(' · ');

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: 14,
            backgroundColor: colors.surface,
            borderWidth: 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 14,
            elevation: 6,
          },
          cardStyle,
          edgeStyle,
        ]}
      >
        <Pressable
          onPress={flip}
          accessibilityRole="button"
          accessibilityLabel={
            isFlipped ? `${word.word}. ${word.translation}` : `${word.word}. ${t('card.tapToReveal')}`
          }
          style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}
        >
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 16, right: 16 }, tagRightStyle]}
          >
            <Tag variant="accent" label={t('card.learned')} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 16, left: 16 }, tagLeftStyle]}
          >
            <Tag variant="neutral" label={t('card.repeat')} />
          </Animated.View>

          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '500', color: colors.text }}>
            {word.word}
          </Text>
          {meta ? (
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>{meta}</Text>
          ) : null}

          {isFlipped ? (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.neutral800,
                paddingTop: 16,
              }}
            >
              <Text style={{ fontSize: 20, lineHeight: 26, color: colors.text }}>
                {word.translation}
              </Text>
            </View>
          ) : (
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>
              {requireFlip ? t('card.flipFirst') : t('card.tapToReveal')}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});
