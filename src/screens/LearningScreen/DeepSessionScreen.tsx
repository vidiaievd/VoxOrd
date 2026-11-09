import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhaseTracker, SessionHeader } from '../../components/practice';
import { ListeningPhase, QuizPhase } from '../../components/practice/ChoicePhase';
import { SpellingPhase } from '../../components/practice/SpellingPhase';
import { Skeleton } from '../../components/ui';
import { PHASE_ORDER, useDeepSession } from '../../hooks/useDeepSession';
import { usePersonalSession } from '../../hooks/usePersonalSession';
import { useTranslation } from '../../i18n';
import type { CourseReviewPhase } from '../../lib/courseReviewSet';
import { useTheme } from '../../providers/ThemeProvider';
import { Deck } from '../../repositories/DeckRepository';
import { CardScreen } from '../CardScreen';
import { PhaseTransitionScreen } from './components/deep-session/PhaseTransitionScreen';

interface DeepSessionScreenProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

/** The deep session's flashcard phase is the tracker's «preview» segment. */
const TRACKER_PHASES: CourseReviewPhase[] = ['preview', 'listening', 'quiz', 'spelling'];

/**
 * Deep session (Practice §8.3): the same words through cards, listening, choice and spelling
 * under one session header and the phase tracker. The phases are the review session's own;
 * the pause between them is 1.2 s and the end goes straight to the results screen.
 */
export function DeepSessionScreen({ deck, onBack, onSessionDone }: DeepSessionScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, isLoading, reportPhaseResult } = useDeepSession(deck.id);
  const [counter, setCounter] = useState<string | undefined>();

  // One session across all four phases. Grading per phase would reschedule the
  // same card up to four times for what the user experiences as one sitting —
  // the trap Step 8.1b called out for course reviews, and it applies here for
  // the same reason: PHASE_ORDER runs the *same word set* through every phase.
  const personal = usePersonalSession(deck.id);

  useEffect(() => {
    if (state.phase === 'complete') personal.finish();
  }, [state.phase, personal]);

  useEffect(() => {
    if (state.phase === 'complete') onSessionDone(state.sessionId ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => setCounter(undefined), [state.phase]);

  const handleProgress = useCallback((index: number, total: number) => {
    setCounter(`${index}/${total}`);
  }, []);

  const handleCardDone = useCallback(
    (_weakIds: number[], correctCount: number) => {
      reportPhaseResult(correctCount);
    },
    [reportPhaseResult],
  );

  if (state.isTransitioning) {
    return (
      <PhaseTransitionScreen
        lastPhase={state.lastPhase}
        lastPhaseCorrect={state.lastPhaseCorrect}
        totalWords={state.totalWords}
      />
    );
  }

  // The session's own id list, fixed when the session loaded — not the ids of
  // `wordsForPhase`, which is re-fetched per phase with `ORDER BY RANDOM()` and
  // therefore arrives in a new order every time. The phases keyed their setup
  // effect on these ids, so the reshuffle re-ran it and each phase opened a
  // second, empty `learning_sessions` row. Flashcards still take the shuffled
  // objects — presentation order is exactly what they want; the other three
  // shuffle internally anyway.
  const wordIds = state.allWordIds;
  const waiting =
    isLoading || state.phase === 'complete' || state.wordsForPhase.length === 0;

  const phaseProps = (mode: 'listening' | 'quiz' | 'spelling') => ({
    deckId: deck.id,
    languageCode: deck.languageCode,
    wordIds,
    tracking: personal.trackingFor(mode),
    onDone: reportPhaseResult,
    onProgress: handleProgress,
  });

  const body = () => {
    if (waiting) {
      return (
        <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 10 }}>
          <Skeleton width={140} height={12} />
          <Skeleton width={180} height={36} />
          <Skeleton height={52} />
        </View>
      );
    }
    switch (state.phase) {
      case 'flashcard':
        return (
          <CardScreen
            deck={deck}
            mode="review"
            overrideWords={state.wordsForPhase}
            onBack={onBack}
            onDeepDone={handleCardDone}
            onProgress={handleProgress}
          />
        );
      case 'listening':
        return <ListeningPhase {...phaseProps('listening')} />;
      case 'quiz':
        return <QuizPhase {...phaseProps('quiz')} />;
      case 'spelling':
        return <SpellingPhase {...phaseProps('spelling')} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <SessionHeader
        title={deck.title}
        leadingLabel={t('common.close')}
        onLeading={onBack}
        counter={counter}
      />
      <PhaseTracker
        phases={TRACKER_PHASES}
        index={Math.min(Math.max(PHASE_ORDER.indexOf(state.phase), 0), TRACKER_PHASES.length - 1)}
      />
      <View style={{ flex: 1 }}>
        {/* A new phase starts from a clean state — the hooks load their questions once. */}
        <View key={state.phase} style={{ flex: 1 }}>
          {body()}
        </View>
      </View>
    </SafeAreaView>
  );
}
