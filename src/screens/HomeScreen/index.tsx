import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { deckRepository, Deck } from '../../repositories/DeckRepository';
import { DeckCard } from './DeckCard';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';

interface HomeScreenProps {
  onDeckPress: (deck: Deck) => void;
}

export function HomeScreen({ onDeckPress }: HomeScreenProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { t } = useTranslation();

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const loadDecks = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const data = await deckRepository.getAll();
    setDecks(data);

    if (isRefresh) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  const totalWords = decks.reduce((s, d) => s + d.totalWords, 0);
  const totalLearned = decks.reduce((s, d) => s + d.learnedWords, 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>VoxOrd</Text>
          <Text style={styles.subtitle}>{t('home.appSubtitle')}</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalValue}>
            {totalLearned}/{totalWords}
          </Text>
          <Text style={styles.totalLabel}>{t('home.learned')}</Text>
        </View>
      </View>

      {/* Deck List */}
      <FlatList
        data={decks}
        keyExtractor={item => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadDecks(true)}
            tintColor="#6c63ff"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('deckCard.noDecksYet')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <DeckCard deck={item} onPress={onDeckPress} />
        )}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 20,
    },
    appName: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    totalBadge: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
      alignItems: 'center',
    },
    totalValue: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textInverted,
    },
    totalLabel: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 1,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    row: {
      justifyContent: 'space-between',
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      paddingTop: 60,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textMuted,
    },
  });
