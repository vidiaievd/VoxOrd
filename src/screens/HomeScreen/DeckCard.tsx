import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Dimensions,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { Deck } from '../../repositories/DeckRepository';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

interface DeckCardProps {
  deck: Deck;
  onPress: (deck: Deck) => void;
}

export function DeckCard({ deck, onPress }: DeckCardProps) {
  const { t } = useTranslation();

  const progress =
    deck.totalWords > 0 ? deck.learnedWords / deck.totalWords : 0;

  const progressPercent = Math.round(progress * 100);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(deck)}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}>{deck.icon}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {deck.title}
      </Text>

      {/* Counters */}
      <View style={styles.counters}>
        <View style={styles.counter}>
          <Text style={styles.counterValue}>{deck.newWords}</Text>
          <Text style={styles.counterLabel}>{t('deckCard.new')}</Text>
        </View>
        <View style={styles.counter}>
          <Text style={[styles.counterValue, styles.repeatColor]}>
            {deck.repeatWords}
          </Text>
          <Text style={styles.counterLabel}>{t('deckCard.repeat')}</Text>
        </View>
        <View style={styles.counter}>
          <Text style={[styles.counterValue, styles.learnedColor]}>
            {deck.learnedWords}
          </Text>
          <Text style={styles.counterLabel}>{t('deckCard.done')}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{progressPercent}%</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  icon: {
    fontSize: 44,
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 12,
    minHeight: 36,
  },
  counters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  counter: {
    alignItems: 'center',
    flex: 1,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6c63ff',
  },
  counterLabel: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
  repeatColor: {
    color: '#ff9f43',
  },
  learnedColor: {
    color: '#34c759',
  },
  progressBg: {
    height: 4,
    backgroundColor: '#f0f0f7',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6c63ff',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 10,
    color: '#aaa',
    textAlign: 'right',
  },
});
