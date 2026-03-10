import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useDeepSession } from '../../hooks/useDeepSession';
import { CardScreen } from '../CardScreen';
import { QuizExercise } from './exercises/QuizExercise';
import { SpellingExercise } from './exercises/SpellingExercise';
import { Deck } from '../../repositories/DeckRepository';

interface DeepSessionScreenProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

const PHASE_LABELS = {
  flashcard: {
    icon: '🃏',
    title: 'Phase 1 — Learn',
    sub: 'Go through all words',
  },
  quiz: {
    icon: '⚡',
    title: 'Phase 2 — Practice',
    sub: 'Quiz on words you missed',
  },
  spelling: {
    icon: '✍️',
    title: 'Phase 3 — Master',
    sub: 'Spell the hardest words',
  },
  complete: { icon: '🏆', title: 'Complete!', sub: '' },
};

export function DeepSessionScreen({
  deck,
  onBack,
  onSessionDone,
}: DeepSessionScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, isLoading, reportPhaseResult } = useDeepSession(deck.id);

  // Collect weak wordIds from CardScreen swipes
  const handleCardDone = useCallback(
    (weakIds: number[], correctCount: number) => {
      reportPhaseResult(weakIds, correctCount);
    },
    [reportPhaseResult],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Phase transition screen — shown briefly between phases
  if (state.wordsForPhase.length === 0 && state.phase !== 'complete') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Preparing next phase...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Complete screen
  if (state.phase === 'complete') {
    const accuracy =
      state.totalWords > 0
        ? Math.round((state.correctTotal / state.totalWords) * 100)
        : 100;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.completeContainer}>
          <Text style={styles.completeEmoji}>🏆</Text>
          <Text style={styles.completeTitle}>Deep session complete!</Text>
          <Text style={styles.completeMessage}>
            You worked through all phases. Your memory for these words is now
            much stronger.
          </Text>

          <View style={styles.completeStats}>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{state.totalWords}</Text>
              <Text style={styles.completeStatLabel}>Words</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text style={styles.completeStatValue}>{accuracy}%</Text>
              <Text style={styles.completeStatLabel}>Final accuracy</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text
                style={[styles.completeStatValue, { color: colors.accent }]}
              >
                {state.phaseIndex - 1}
              </Text>
              <Text style={styles.completeStatLabel}>Phases done</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => onSessionDone(state.sessionId ?? 0)}
          >
            <Text style={styles.primaryBtnText}>See full results →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const phaseInfo = PHASE_LABELS[state.phase];

  // Phase header overlay component
  const PhaseHeader = () => (
    <View style={styles.phaseHeader}>
      {/* Progress dots */}
      <View style={styles.phaseDots}>
        {(['flashcard', 'quiz', 'spelling'] as const).map((p, i) => (
          <View
            key={p}
            style={[
              styles.phaseDot,
              state.phase === p && styles.phaseDotActive,
              state.phaseIndex > i + 1 && styles.phaseDotDone,
            ]}
          />
        ))}
      </View>
      <Text style={styles.phaseLabel}>
        {phaseInfo.icon} {phaseInfo.title}
      </Text>
      {state.phase !== 'flashcard' && (
        <Text style={styles.phaseWordCount}>
          {state.wordsForPhase.length} words to review
        </Text>
      )}
    </View>
  );

  // Render current phase exercise
  switch (state.phase) {
    case 'flashcard':
      return (
        <View style={styles.flex}>
          <PhaseHeader />
          <CardScreen
            deck={deck}
            overrideWords={state.wordsForPhase}
            onBack={onBack}
            onDeepDone={handleCardDone}
          />
        </View>
      );

    case 'quiz':
      return (
        <View style={styles.flex}>
          <PhaseHeader />
          <QuizExercise
            deckId={deck.id}
            overrideWordIds={state.wordsForPhase.map(w => w.wordId)}
            onBack={onBack}
            onSessionDone={sid => {
              // Quiz doesn't report weak ids directly —
              // useQuiz needs onWeakIds callback
              onSessionDone(sid);
            }}
            onWeakIds={(weakIds, correct) =>
              reportPhaseResult(weakIds, correct)
            }
          />
        </View>
      );

    case 'spelling':
      return (
        <View style={styles.flex}>
          <PhaseHeader />
          <SpellingExercise
            deckId={deck.id}
            overrideWordIds={state.wordsForPhase.map(w => w.wordId)}
            onBack={onBack}
            onSessionDone={sid => onSessionDone(sid)}
            onWeakIds={(weakIds, correct) =>
              reportPhaseResult(weakIds, correct)
            }
          />
        </View>
      );

    default:
      return null;
  }
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textMuted,
    },
    phaseHeader: {
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    phaseDots: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    phaseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      marginHorizontal: 4,
    },
    phaseDotActive: {
      backgroundColor: colors.accent,
      width: 20,
    },
    phaseDotDone: {
      backgroundColor: colors.success,
    },
    phaseLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    phaseWordCount: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    completeContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    completeEmoji: {
      fontSize: 72,
      marginBottom: 16,
    },
    completeTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    completeMessage: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    completeStats: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 20,
      marginBottom: 32,
      width: '100%',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    completeStat: {
      flex: 1,
      alignItems: 'center',
    },
    completeStatValue: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    completeStatLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: 'center',
    },
    completeStatDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 48,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
