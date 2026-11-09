import React from 'react';
import { QuizPhase } from '../../../components/practice/ChoicePhase';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';
import { useTranslation } from '../../../i18n';
import type { Deck } from '../../../repositories/DeckRepository';
import { ModeShell, useStandaloneMode } from '../ModeShell';

interface QuizExerciseProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

/**
 * «Quick quiz» on its own (Practice §8.3): the review session's choice phase over the whole
 * set, in its own session, which the results screen then reads.
 */
export function QuizExercise({ deck, onBack, onSessionDone }: QuizExerciseProps) {
  const { t } = useTranslation();
  const tracking = useOwnedTracking(deck.id, 'quiz');
  const mode = useStandaloneMode(onSessionDone);
  return (
    <ModeShell title={t('modes.quiz')} counter={mode.counter} empty={mode.empty} onBack={onBack}>
      <QuizPhase
        deckId={deck.id}
        languageCode={deck.languageCode}
        tracking={tracking}
        onDone={mode.onDone}
        onProgress={mode.onProgress}
        onSession={mode.onSession}
      />
    </ModeShell>
  );
}
