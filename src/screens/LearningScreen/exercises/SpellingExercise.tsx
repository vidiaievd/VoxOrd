import React from 'react';
import { SpellingPhase } from '../../../components/practice/SpellingPhase';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';
import { useTranslation } from '../../../i18n';
import type { Deck } from '../../../repositories/DeckRepository';
import { ModeShell, useStandaloneMode } from '../ModeShell';

interface SpellingExerciseProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

/**
 * «Spelling» on its own (Practice §8.3): the review session's spelling phase over the whole
 * set, in its own session, which the results screen then reads.
 */
export function SpellingExercise({ deck, onBack, onSessionDone }: SpellingExerciseProps) {
  const { t } = useTranslation();
  const tracking = useOwnedTracking(deck.id, 'spelling');
  const mode = useStandaloneMode(onSessionDone);
  return (
    <ModeShell title={t('modes.spelling')} counter={mode.counter} empty={mode.empty} onBack={onBack}>
      <SpellingPhase
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
