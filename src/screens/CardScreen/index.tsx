import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCard } from '../../hooks/useCard';
import { FlipCard } from './FlipCard';
import { Deck } from '../../repositories/DeckRepository';

interface CardScreenProps {
  deck: Deck;
  onBack: () => void;
}

export function CardScreen({ deck, onBack }: CardScreenProps) {
  const { word, isLoading, isEmpty, onSwipe, onFlip } = useCard(deck.id);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      </SafeAreaView>
    );
  }

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>All done!</Text>
          <Text style={styles.emptySubtitle}>
            No more cards in "{deck.title}"
          </Text>
          <TouchableOpacity style={styles.backToDeckBtn} onPress={onBack}>
            <Text style={styles.backToDeckText}>Back to decks</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>{deck.icon}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {deck.title}
          </Text>
        </View>
        <Text style={styles.headerStatus}>{word?.status}</Text>
      </View>

      {/* Card */}
      <View style={styles.cardArea}>
        {word && (
          <FlipCard
            key={word.id}
            word={word}
            onSwipe={onSwipe}
            onFlip={onFlip}
          />
        )}
      </View>

      {/* Hints */}
      <View style={styles.hints}>
        <View style={styles.hint}>
          <Text style={styles.hintArrow}>←</Text>
          <Text style={styles.hintText}>repeat</Text>
        </View>
        <View style={[styles.hint, styles.hintRight]}>
          <Text style={styles.hintText}>learned</Text>
          <Text style={styles.hintArrow}>→</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f7',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backBtn: {
    padding: 20,
  },
  backText: {
    fontSize: 16,
    color: '#6c63ff',
    fontWeight: '600',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    flexShrink: 1,
  },
  headerStatus: {
    fontSize: 11,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    minWidth: 50,
    textAlign: 'right',
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintRight: {
    flexDirection: 'row-reverse',
  },
  hintArrow: {
    fontSize: 16,
    color: '#ccc',
  },
  hintText: {
    fontSize: 13,
    color: '#ccc',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  backToDeckBtn: {
    marginTop: 32,
    backgroundColor: '#6c63ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backToDeckText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
