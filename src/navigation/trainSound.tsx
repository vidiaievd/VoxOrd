import React, { createContext, useContext } from 'react';

/**
 * «Train this sound» from wherever a sound card opens over the current screen (OQ-10, П-5).
 *
 * The navigator holds one screen, so a card opened from an AI review is drawn in a modal over
 * the runner or the submission, and the runner keeps its place. Leaving for a session is the
 * navigator's business: it provides this, and a card without it (tests, or a host that has
 * no navigator) simply draws no «Train» button.
 */
type TrainSound = (atomId: string) => void;

const TrainSoundContext = createContext<TrainSound | null>(null);

export function TrainSoundProvider({
  onTrain,
  children,
}: {
  onTrain: TrainSound;
  children: React.ReactNode;
}) {
  return <TrainSoundContext.Provider value={onTrain}>{children}</TrainSoundContext.Provider>;
}

export function useTrainSound(): TrainSound | null {
  return useContext(TrainSoundContext);
}
