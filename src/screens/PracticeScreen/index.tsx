import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Icon,
  Overline,
  PressableScale,
  type IconName,
} from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import { deckRepository, type Deck } from '../../repositories/DeckRepository';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';

interface PracticeScreenProps {
  onStartReview: () => void;
  onOpenMyWords: () => void;
  onOpenDeck: (deck: Deck) => void;
}

/**
 * The Practice tab's root — for now only the ways into what already exists: the review, «My
 * words» and the word decks. Plan 05 builds the real screen.
 */
export function PracticeScreen({
  onStartReview,
  onOpenMyWords,
  onOpenDeck,
}: PracticeScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Practice', scrollRef);

  const [decks, setDecks] = useState<Deck[]>([]);
  useEffect(() => {
    deckRepository
      .getAll()
      .then(setDecks)
      .catch(() => setDecks([]));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          {t('nav.practice')}
        </Text>

        <Row
          icon="Repeat"
          label={t('today.reviewTitle')}
          onPress={onStartReview}
          styles={styles}
        />
        <Row
          icon="BookmarkSimple"
          label={t('myWords.title')}
          onPress={onOpenMyWords}
          styles={styles}
        />

        {decks.length > 0 && (
          <View style={styles.section}>
            <Overline>{t('home.myDecks')}</Overline>
            {decks.map(deck => (
              <Row
                key={deck.id}
                icon="Cards"
                label={deck.title}
                meta={t('home.deckWords', { count: deck.totalWords })}
                onPress={() => onOpenDeck(deck)}
                styles={styles}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  meta,
  onPress,
  styles,
}: {
  icon: IconName;
  label: string;
  meta?: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
    >
      <Icon name={icon} size={20} color={colors.accent300} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {meta !== undefined && <Text style={styles.rowMeta}>{meta}</Text>}
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: {
      paddingTop: 14,
      paddingHorizontal: 18,
      paddingBottom: 24,
      gap: 14,
    },
    title: { ...typography.h1, color: colors.text },
    section: { gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.surface,
    },
    rowLabel: { ...typography.cardTitle, color: colors.text, flex: 1 },
    rowMeta: { ...typography.meta, color: colors.neutral500 },
  });
