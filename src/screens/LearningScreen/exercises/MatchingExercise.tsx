import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useMatching } from '../../../hooks/useMatching';

interface MatchingExerciseProps {
  deckId: number;
  onBack: () => void;
  onDone: () => void;
}

export function MatchingExercise({
  deckId,
  onBack,
  onDone,
}: MatchingExerciseProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, isLoading, selectWord, selectTrans } = useMatching(deckId);

  // Shuffle translations independently from words
  const shuffledTrans = useMemo(
    () => [...state.pairs].sort(() => Math.random() - 0.5),
    [state.pairs],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (state.isComplete) {
    const accuracy =
      state.pairs.length > 0
        ? Math.round((state.matched.size / state.pairs.length) * 100)
        : 0;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={styles.resultTitle}>Well done!</Text>
          <Text style={styles.resultSub}>
            {state.matched.size} / {state.pairs.length} correct — {accuracy}%
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
            <Text style={styles.doneBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const getWordStyle = (wordId: number) => {
    if (state.matched.has(wordId)) return styles.itemMatched;
    if (state.mistakeWordIds.has(wordId)) return styles.itemMistake;
    if (state.selectedWordId === wordId) return styles.itemSelected;
    return styles.item;
  };

  const getTransStyle = (wordId: number) => {
    if (state.matched.has(wordId)) return styles.itemMatched;
    if (state.mistakeTransIds.has(wordId)) return styles.itemMistake;
    if (state.selectedTransId === wordId) return styles.itemSelected;
    return styles.item;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Match the words</Text>
        <Text style={styles.progress}>
          {state.matched.size}/{state.pairs.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.board}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.columns}>
          {/* Left column — words */}
          <View style={styles.column}>
            <Text style={styles.columnLabel}>Norwegian</Text>
            {state.pairs.map(pair => (
              <TouchableOpacity
                key={`word-${pair.wordId}`}
                style={[styles.item, getWordStyle(pair.wordId)]}
                onPress={() => selectWord(pair.wordId)}
                disabled={state.matched.has(pair.wordId)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.itemText,
                    state.matched.has(pair.wordId) && styles.itemTextMatched,
                  ]}
                >
                  {pair.word}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Right column — translations (shuffled) */}
          <View style={styles.column}>
            <Text style={styles.columnLabel}>Translation</Text>
            {shuffledTrans.map(pair => (
              <TouchableOpacity
                key={`trans-${pair.wordId}`}
                style={[styles.item, getTransStyle(pair.wordId)]}
                onPress={() => selectTrans(pair.wordId)}
                disabled={state.matched.has(pair.wordId)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.itemText,
                    state.matched.has(pair.wordId) && styles.itemTextMatched,
                  ]}
                >
                  {pair.translation}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 8,
    },
    backText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    progress: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
    },
    board: {
      padding: 16,
    },
    columns: {
      flexDirection: 'row',
    },
    column: {
      flex: 1,
      marginRight: 8,
    },
    columnLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 10,
      textAlign: 'center',
    },
    item: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    itemSelected: {
      backgroundColor: colors.accentLight,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.accent,
      elevation: 2,
    },
    itemMatched: {
      backgroundColor: 'rgba(52, 199, 89, 0.15)',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.success,
      elevation: 0,
    },
    itemMistake: {
      backgroundColor: 'rgba(255, 59, 48, 0.1)',
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 10,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.error,
      elevation: 2,
    },
    itemText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    itemTextMatched: {
      color: colors.success,
    },
    // Result screen
    resultContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    resultEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    resultTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    resultSub: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 32,
    },
    doneBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 48,
    },
    doneBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
