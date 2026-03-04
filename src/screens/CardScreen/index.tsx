import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useCard } from '../../hooks/useCard';
import { FlipCard } from './FlipCard';

export function CardScreen() {
  const { word, isLoading, isEmpty, onSwipe, onFlip } = useCard();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🎉</Text>
        <Text style={styles.emptyTitle}>All done!</Text>
        <Text style={styles.emptySubtitle}>No more cards to review</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Flash Cards</Text>
        <Text style={styles.headerStatus}>{word?.status}</Text>
      </View>

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

      <View style={styles.hints}>
        <Text style={styles.hintText}>← repeat</Text>
        <Text style={styles.hintText}>learned →</Text>
      </View>
    </View>
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
    backgroundColor: '#f0f0f7',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  headerStatus: {
    fontSize: 13,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingBottom: 48,
  },
  hintText: {
    fontSize: 13,
    color: '#bbb',
    letterSpacing: 0.5,
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
  },
});