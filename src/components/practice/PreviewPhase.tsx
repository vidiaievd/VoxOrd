import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { useCard } from '../../hooks/useCard';
import type { DeepSessionWord } from '../../hooks/useDeepSession';
import { Button } from '../ui/Button';
import { Overline } from '../ui/Overline';
import { Skeleton } from '../ui/Skeleton';
import { PhaseFooter } from './PhaseFooter';
import { useSpeakWord } from './useSpeakWord';

export interface PreviewPhaseProps {
  deckId: number;
  languageCode: string;
  words: DeepSessionWord[];
  onDone: () => void;
  /** «{i}/{n}» for the session header. */
  onProgress?: (index: number, total: number) => void;
}

/**
 * «New word» (Practice §7.2, 6c): the card shows the word, a tap reveals the translation under
 * a hairline, and «Next» waits for that tap. It scores nothing — `useCard` in `review` mode
 * writes nothing at all; «Next» is the old swipe to the right, which only moves the queue on.
 */
export function PreviewPhase({
  deckId,
  languageCode,
  words,
  onDone,
  onProgress,
}: PreviewPhaseProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { speak, canSpeak } = useSpeakWord(languageCode);
  const { word, isLoading, onSwipe } = useCard(deckId, 'review', words, () => onDone());
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onProgress?.(Math.min(index + 1, words.length), words.length);
  }, [index, words.length, onProgress]);

  useEffect(() => {
    setRevealed(false);
    shown.setValue(0);
  }, [word?.id, shown]);

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  const next = () => {
    if (!revealed) return;
    setIndex(i => i + 1);
    void onSwipe('right');
  };

  if (isLoading || !word) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <Skeleton height={400} radius={radii.card} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? `${word.word}, ${word.translation}` : word.word}
          accessibilityHint={revealed ? undefined : t('reviewSession.tapToFlip')}
          onPress={reveal}
          style={{
            height: 400,
            borderRadius: radii.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.neutral800,
            padding: 24,
            gap: 18,
            justifyContent: 'center',
          }}
        >
          <Overline style={{ color: colors.accent300 }}>{t('reviewSession.newWord')}</Overline>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                flex: 1,
                fontSize: 34,
                lineHeight: 40,
                fontWeight: '500',
                letterSpacing: -0.7,
                color: colors.text,
              }}
            >
              {word.word}
            </Text>
            {canSpeak ? (
              <Button
                variant="ghost"
                size={40}
                iconOnly
                icon="SpeakerHigh"
                accessibilityLabel={t('reviewSession.listen')}
                onPress={() => speak(word.word)}
              />
            ) : null}
          </View>
          {revealed ? (
            <Animated.View
              style={{
                opacity: shown,
                borderTopWidth: 1,
                borderTopColor: colors.neutral800,
                paddingTop: 18,
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 22, lineHeight: 28, color: colors.text }}>
                {word.translation}
              </Text>
            </Animated.View>
          ) : (
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>
              {t('reviewSession.tapToFlip')}
            </Text>
          )}
        </Pressable>
      </View>
      <PhaseFooter>
        <Button block label={t('reviewSession.next')} disabled={!revealed} onPress={next} />
      </PhaseFooter>
    </View>
  );
}
