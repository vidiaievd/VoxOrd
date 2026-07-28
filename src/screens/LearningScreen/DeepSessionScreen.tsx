import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { useDeepSession } from '../../hooks/useDeepSession';
import { Deck } from '../../repositories/DeckRepository';
import { usePersonalSession } from '../../hooks/usePersonalSession';

import { PhaseHeader } from './components/deep-session/PhaseHeader';
import { PhaseTransitionScreen } from './components/deep-session/PhaseTransitionScreen';
import { DeepSessionCompleteScreen } from './components/deep-session/DeepSessionCompleteScreen';
import { CardScreen } from '../CardScreen';
import { QuizExercise } from './exercises/QuizExercise';
import { SpellingExercise } from './exercises/SpellingExercise';
import { ListeningExercise } from './exercises/ListeningExercise';

interface DeepSessionScreenProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

export function DeepSessionScreen({
  deck,
  onBack,
  onSessionDone,
}: DeepSessionScreenProps) {
  const { colors } = useTheme();
  const { state, isLoading, reportPhaseResult } = useDeepSession(deck.id);

  // One session across all four phases. Grading per phase would reschedule the
  // same card up to four times for what the user experiences as one sitting —
  // the trap Step 8.1b called out for course reviews, and it applies here for
  // the same reason: PHASE_ORDER runs the *same word set* through every phase.
  const personal = usePersonalSession(deck.id);

  useEffect(() => {
    if (state.phase === 'complete') personal.finish();
  }, [state.phase, personal]);

  const handleCardDone = useCallback(
    (_weakIds: number[], correctCount: number) => {
      reportPhaseResult(correctCount);
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

  if (state.isTransitioning) {
    return (
      <PhaseTransitionScreen
        lastPhase={state.lastPhase}
        lastPhaseCorrect={state.lastPhaseCorrect}
        totalWords={state.totalWords}
      />
    );
  }

  if (state.wordsForPhase.length === 0 && state.phase !== 'complete') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'complete') {
    return (
      <DeepSessionCompleteScreen
        totalWords={state.totalWords}
        correctTotal={state.correctTotal}
        phaseIndex={state.phaseIndex}
        sessionId={state.sessionId}
        onSessionDone={onSessionDone}
      />
    );
  }

  const wordIds = state.wordsForPhase.map(w => w.wordId);
  const header = (
    <PhaseHeader
      phase={state.phase}
      phaseIndex={state.phaseIndex}
      totalPhases={state.totalPhases}
    />
  );

  switch (state.phase) {
    case 'flashcard':
      return (
        <View style={styles.flex}>
          {header}
          <CardScreen
            deck={deck}
            mode="review"
            overrideWords={state.wordsForPhase}
            onBack={onBack}
            onDeepDone={handleCardDone}
          />
        </View>
      );
    case 'quiz':
      return (
        <View style={styles.flex}>
          {header}
          <QuizExercise
            deckId={deck.id}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={onSessionDone}
            onComplete={reportPhaseResult}
            tracking={personal.trackingFor('quiz')}
          />
        </View>
      );
    case 'spelling':
      return (
        <View style={styles.flex}>
          {header}
          <SpellingExercise
            deckId={deck.id}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={onSessionDone}
            onComplete={reportPhaseResult}
            tracking={personal.trackingFor('spelling')}
          />
        </View>
      );
    case 'listening':
      return (
        <View style={styles.flex}>
          {header}
          <ListeningExercise
            deckId={deck.id}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={onSessionDone}
            onComplete={reportPhaseResult}
            tracking={personal.trackingFor('listening')}
          />
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
