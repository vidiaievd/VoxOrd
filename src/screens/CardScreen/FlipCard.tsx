import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from '../../i18n';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Word, WordStatus } from '../../db/words';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

interface FlipCardProps {
  word: Word;
  onSwipe: (status: WordStatus) => void;
  onFlip: () => void;
}

export function FlipCard({ word, onSwipe, onFlip }: FlipCardProps) {
  const { t } = useTranslation();

  const [isFlipped, setIsFlipped] = useState(false);

  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const flip = useCallback(() => {
    const toValue = isFlipped ? 0 : 180;
    rotation.value = withTiming(toValue, { duration: 400 });
    setIsFlipped(prev => !prev);
    if (!isFlipped) onFlip();
  }, [isFlipped, onFlip, rotation]);

  const handleSwipe = useCallback(
    (status: WordStatus) => {
      'worklet';
      const toX =
        status === 'learned' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
      translateX.value = withTiming(toX, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 }, () => {
        'worklet';
        scheduleOnRN(onSwipe, status);
        translateX.value = 0;
        opacity.value = 1;
      });
    },
    [onSwipe, translateX, opacity],
  );

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = e.translationX;
    })
    .onEnd(e => {
      if (e.translationX > SWIPE_THRESHOLD) {
        handleSwipe('learned');
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        handleSwipe('repeat');
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  // front side
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
    ],
    opacity: interpolate(rotation.value, [0, 90, 180], [1, 0, 0]),
    backfaceVisibility: 'hidden',
  }));

  // back side
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
    ],
    opacity: interpolate(rotation.value, [0, 90, 180], [0, 0, 1]),
    backfaceVisibility: 'hidden',
  }));

  // swipe style + overlay colors
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const overlayLearnedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      'clamp',
    ),
  }));

  const overlayRepeatStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, -SWIPE_THRESHOLD],
      [0, 1],
      'clamp',
    ),
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        <Pressable onPress={flip} style={styles.pressable}>
          {/* Overlay learned (green) */}
          <Animated.View
            style={[styles.overlay, styles.overlayLearned, overlayLearnedStyle]}
          >
            <Text style={styles.overlayText}>✓ {t('card.learned')}</Text>
          </Animated.View>

          {/* Overlay repeat (red) */}
          <Animated.View
            style={[styles.overlay, styles.overlayRepeat, overlayRepeatStyle]}
          >
            <Text style={styles.overlayText}>↩ {t('card.repeat')}</Text>
          </Animated.View>

          {/* front side */}
          <Animated.View style={[styles.card, frontStyle]}>
            <Text style={styles.label}>{t('card.word')}</Text>
            <Text style={styles.word}>{word.word}</Text>
            <Text style={styles.hint}>{t('card.tapToReveal')}</Text>
          </Animated.View>

          {/* back side */}
          <Animated.View style={[styles.card, styles.cardBack, backStyle]}>
            <Text style={styles.label}>{t('card.translation')}</Text>
            <Text style={styles.word}>{word.translation}</Text>
            <Text style={styles.statusBadge}>{word.status}</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: SCREEN_WIDTH - 48,
    height: 280,
  },
  pressable: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    padding: 24,
  },
  cardBack: {
    backgroundColor: '#f8f9ff',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#aaa',
    marginBottom: 16,
  },
  word: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    color: '#ccc',
  },
  statusBadge: {
    marginTop: 12,
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  overlayLearned: {
    backgroundColor: 'rgba(52, 199, 89, 0.85)',
  },
  overlayRepeat: {
    backgroundColor: 'rgba(255, 59, 48, 0.85)',
  },
  overlayText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
  },
});
