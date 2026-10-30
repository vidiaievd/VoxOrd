import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SessionHeader } from '../../components/practice';
import { Button, Icon, Skeleton } from '../../components/ui';
import { DeepSessionWord } from '../../hooks/useDeepSession';
import { FlashcardMode, useCard } from '../../hooks/useCard';
import { useOwnedTracking } from '../../hooks/usePersonalSession';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { Deck } from '../../repositories/DeckRepository';
import { CARD_HEIGHT, CARD_WIDTH, FlipCard, FlipCardHandle } from './FlipCard';

interface CardScreenProps {
  deck: Deck;
  mode?: FlashcardMode;
  overrideWords?: DeepSessionWord[];
  onBack: () => void;
  onDeepDone?: (weakIds: number[], correctCount: number) => void;
  /** «{i}/{n}» up to the deep session's header, which this screen then leaves to it. */
  onProgress?: (index: number, total: number) => void;
}

/**
 * Self-assessment (Practice §8.2, 6h) and the deep session's card phase: a stack of cards
 * decided by swipe, with two round buttons as the accessible way to do the same. Inside the
 * deep session (`overrideWords`) the session header belongs to the parent.
 */
export function CardScreen({
  deck,
  mode = 'assessment',
  overrideWords,
  onBack,
  onDeepDone,
  onProgress,
}: CardScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cardRef = useRef<FlipCardHandle>(null);
  const embedded = !!overrideWords;

  // Only 'assessment' schedules anything: in 'review' mode (Deep Session's
  // flashcard phase) useCard writes nothing at all, and the measured phases
  // that follow are what grade those words.
  const session = useOwnedTracking(deck.id, 'flashcard');
  const { word, isLoading, isEmpty, answered, total, onSwipe, onFlip } = useCard(
    deck.id,
    mode,
    overrideWords,
    onDeepDone,
    mode === 'assessment' ? session : undefined,
  );

  useEffect(() => {
    if (total !== null && total > 0) onProgress?.(Math.min(answered + 1, total), total);
  }, [answered, total, onProgress]);

  const counter = total !== null && total > 0 ? `${Math.min(answered + 1, total)}/${total}` : undefined;
  const hasNext = total === null || answered + 1 < total;

  const header = embedded ? null : (
    <SessionHeader
      title={deck.title}
      leadingLabel={t('common.close')}
      onLeading={onBack}
      counter={counter}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={embedded ? [] : ['top']}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton width={CARD_WIDTH} height={CARD_HEIGHT} radius={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (isEmpty) {
    // Inside the deep session an empty queue is reported through `onDeepDone`; this is the
    // set's own «nothing left» (Practice §7.6 look).
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={embedded ? [] : ['top', 'bottom']}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 }}>
          <Icon name="CheckCircle" size={36} color={colors.accent300} />
          <Text
            accessibilityRole="header"
            style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}
          >
            {t('card.allDone')}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.neutral400 }}>
            {t('card.allDoneDesc')} «{deck.title}»
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Button block variant="ghost" label={t('card.backToDecks')} onPress={onBack} />
        </View>
      </SafeAreaView>
    );
  }

  const round = (direction: 'left' | 'right') => {
    const isRight = direction === 'right';
    const label = isRight ? t('card.learned') : t('card.repeat');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => cardRef.current?.swipe(direction)}
        style={{ flexDirection: isRight ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: isRight ? colors.accentBase : colors.neutral700,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={isRight ? 'Check' : 'ArrowCounterClockwise'}
            size={22}
            color={isRight ? colors.accent300 : colors.neutral300}
          />
        </View>
        <Text style={{ fontSize: 13, color: isRight ? colors.accent300 : colors.neutral400 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={embedded ? ['bottom'] : ['top', 'bottom']}>
      {header}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {hasNext ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 14,
              backgroundColor: colors.surface,
              opacity: 0.5,
              transform: [{ translateY: 14 }, { scale: 0.94 }],
            }}
          />
        ) : null}
        {word && (
          <FlipCard
            ref={cardRef}
            key={word.id}
            word={word}
            onSwipe={onSwipe}
            onFlip={onFlip}
            requireFlip={mode === 'review'}
          />
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingTop: 16,
          paddingHorizontal: 32,
          paddingBottom: 16,
        }}
      >
        {round('left')}
        {round('right')}
      </View>
    </SafeAreaView>
  );
}
