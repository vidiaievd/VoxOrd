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
import { Word } from '../../db/words';
import { SwipeDirection } from '../../hooks/useCard';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

interface FlipCardProps {
  word: Word;
  onSwipe: (direction: SwipeDirection) => void;
  onFlip: () => void;
  requireFlip?: boolean; // if true — swipe blocked until card is flipped
}

export function FlipCard({
  word,
  onSwipe,
  onFlip,
  requireFlip,
}: FlipCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180])}deg` },
    ],
    opacity: interpolate(rotation.value, [0, 90, 180], [1, 0, 0]),
    backfaceVisibility: 'hidden',
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360])}deg` },
    ],
    opacity: interpolate(rotation.value, [0, 90, 180], [0, 0, 1]),
    backfaceVisibility: 'hidden',
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const overlayRightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      'clamp',
    ),
  }));

  const overlayLeftStyle = useAnimatedStyle(() => ({
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
          {/* Overlay right → know (green) */}
          <Animated.View
            style={[styles.overlay, styles.overlayRight, overlayRightStyle]}
          >
            <Text style={styles.overlayText}>✓ {t('card.learned')}</Text>
          </Animated.View>

          {/* Overlay left → don't know (red) */}
          <Animated.View
            style={[styles.overlay, styles.overlayLeft, overlayLeftStyle]}
          >
            <Text style={styles.overlayText}>↩ {t('card.repeat')}</Text>
          </Animated.View>

          {/* Front side */}
          <Animated.View style={[styles.card, frontStyle]}>
            <Text style={styles.label}>{t('card.word')}</Text>
            <Text style={styles.word}>{word.word}</Text>
            <Text style={styles.hint}>
              {requireFlip && !isFlipped
                ? '👆 ' + t('card.tapToReveal')
                : t('card.tapToReveal')}
            </Text>
            {requireFlip && !isFlipped && (
              <Text style={styles.swipeBlockedHint}>{t('card.flipFirst')}</Text>
            )}
          </Animated.View>

          {/* Back side */}
          <Animated.View style={[styles.card, styles.cardBack, backStyle]}>
            <Text style={styles.label}>{t('card.translation')}</Text>
            <Text style={styles.word}>{word.translation}</Text>
            <Text style={styles.stageBadge}>
              {word.memoryStage !== undefined
                ? `Stage ${word.memoryStage}`
                : word.status}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
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
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 6,
      padding: 24,
    },
    cardBack: {
      backgroundColor: colors.backgroundInput,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2,
      color: colors.textMuted,
      marginBottom: 16,
    },
    word: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    hint: {
      marginTop: 16,
      fontSize: 13,
      color: colors.textMuted,
    },
    stageBadge: {
      marginTop: 12,
      fontSize: 12,
      color: colors.accent,
      fontWeight: '600',
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
    overlayRight: {
      backgroundColor: 'rgba(52, 199, 89, 0.85)',
    },
    overlayLeft: {
      backgroundColor: 'rgba(255, 59, 48, 0.85)',
    },
    overlayText: {
      fontSize: 28,
      fontWeight: '800',
      color: '#fff',
      letterSpacing: 2,
    },
    swipeBlockedHint: {
      marginTop: 8,
      fontSize: 12,
      color: colors.accent,
      fontWeight: '600',
      opacity: 0.8,
    },
  });
