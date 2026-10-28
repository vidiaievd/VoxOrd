import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Overline, PressableScale } from '../../components/ui';
import type { DueCount } from '../../hooks/useDueCount';
import { usePracticeHome } from '../../hooks/usePracticeHome';
import { useTranslation } from '../../i18n';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import type { Deck } from '../../repositories/DeckRepository';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';
import { DeckRow } from './DeckRow';
import { MyWordsCard } from './MyWordsCard';
import { ReviewHeroCard } from './ReviewHeroCard';

/** Sets shown before «All N» opens the rest in place. */
const DECKS_COLLAPSED = 3;

interface PracticeScreenProps {
  /** The app's one due number (decision D3) — the same the tab badge shows. */
  due: DueCount;
  onStartReview: () => void;
  onOpenMyWords: () => void;
  onOpenDeck: (deck: Deck) => void;
}

/**
 * The Practice tab's root (Practice 6a): the review card, the word sets and «My words».
 * Grammar and mistakes sections wait for their backends (`PRACTICE_FEATURES`). Each part
 * loads on its own, and a section with no data is not drawn.
 */
export function PracticeScreen({
  due,
  onStartReview,
  onOpenMyWords,
  onOpenDeck,
}: PracticeScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Practice', scrollRef);

  const home = usePracticeHome();
  const [allDecks, setAllDecks] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { reload } = home;
  const { refresh: refreshDue } = due;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    reload();
    await refreshDue().catch(() => undefined);
    setRefreshing(false);
  }, [reload, refreshDue]);

  const overview = home.overview;
  const decks = home.decks ?? [];
  const shownDecks = allDecks ? decks : decks.slice(0, DECKS_COLLAPSED);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {overview?.fromReplica ? <OfflineBanner /> : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentBase}
          />
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          {t('practice.title')}
        </Text>

        <ReviewHeroCard
          due={due}
          dailyLimit={overview?.dailyLimit ?? 0}
          reviewedToday={overview?.reviewedToday ?? due.reviewedToday ?? 0}
          sources={{ courseWords: overview?.totalDue ?? null }}
          forecast={null}
          onStart={onStartReview}
          onRetry={() => {
            reload();
            void refreshDue();
          }}
        />

        {decks.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Overline>{t('practice.decksSection')}</Overline>
              {decks.length > DECKS_COLLAPSED && !allDecks ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => setAllDecks(true)}
                  hitSlop={8}
                >
                  <Text style={styles.all}>{t('practice.decksAll', { count: decks.length })}</Text>
                </PressableScale>
              ) : null}
            </View>
            <View>
              {shownDecks.map(deck => (
                <DeckRow key={deck.id} deck={deck} onPress={() => onOpenDeck(deck)} />
              ))}
            </View>
          </View>
        ) : null}

        <MyWordsCard summary={home.myWords} onPress={onOpenMyWords} />
      </ScrollView>
    </SafeAreaView>
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
    section: { gap: 8, marginTop: 4 },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    all: { ...typography.meta, color: colors.accent300 },
  });
