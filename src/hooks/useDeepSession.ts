import { useState, useCallback, useEffect, useRef } from 'react';
import { sessionRepository } from '../repositories/SessionRepository';
import { deepSessionRepository } from '../repositories/DeepSessionRepository';

export type DeepPhase =
  | 'flashcard'
  | 'listening'
  | 'quiz'
  | 'spelling'
  | 'complete';

export interface DeepSessionWord {
  wordId: number;
  word: string;
  translation: string;
}

export interface DeepSessionState {
  phase: DeepPhase;
  phaseIndex: number;
  totalPhases: number;
  wordsForPhase: DeepSessionWord[];
  allWordIds: number[];
  sessionId: number | null;
  totalWords: number;
  correctTotal: number;
  isTransitioning: boolean; // true while showing between-phase screen
  lastPhaseCorrect: number; // correct count of just-finished phase
  lastPhase: DeepPhase; // phase that just finished
}

export interface UseDeepSessionResult {
  state: DeepSessionState;
  isLoading: boolean;
  reportPhaseResult: (correctCount: number) => void;
}

export const PHASE_ORDER: DeepPhase[] = ['flashcard', 'listening', 'quiz', 'spelling'];

const TRANSITION_DELAY_MS = 3000;

export function getNextPhase(current: DeepPhase): DeepPhase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return 'complete';
  return PHASE_ORDER[idx + 1];
}

const PHASE_LABELS: Record<DeepPhase, { icon: string; label: string }> = {
  flashcard: { icon: '🃏', label: 'Flashcards' },
  listening: { icon: '👂', label: 'Listening' },
  quiz: { icon: '⚡', label: 'Quiz' },
  spelling: { icon: '✍️', label: 'Spelling' },
  complete: { icon: '🏆', label: 'Complete' },
};

export { PHASE_LABELS };

export function useDeepSession(deckId: number): UseDeepSessionResult {
  const [isLoading, setIsLoading] = useState(true);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<DeepSessionState>({
    phase: PHASE_ORDER[0],
    phaseIndex: 1,
    totalPhases: 4,
    wordsForPhase: [],
    allWordIds: [],
    sessionId: null,
    totalWords: 0,
    correctTotal: 0,
    isTransitioning: false,
    lastPhaseCorrect: 0,
    lastPhase: 'flashcard',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, words] = await Promise.all([
        sessionRepository.create('deep', deckId),
        deepSessionRepository.loadWordsForDeck(deckId),
      ]);
      if (!cancelled) {
        setState(prev => ({
          ...prev,
          phase: PHASE_ORDER[0],
          phaseIndex: 1,
          wordsForPhase: words,
          allWordIds: words.map(w => w.wordId),
          sessionId: sid,
          totalWords: words.length,
        }));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const reportPhaseResult = useCallback((correctCount: number) => {
    setState(prev => {
      const newCorrectTotal = prev.correctTotal + correctCount;
      const nextPhase = getNextPhase(prev.phase);
      const nextPhaseIndex = prev.phaseIndex + 1;

      if (nextPhase === 'complete') {
        if (prev.sessionId) {
          sessionRepository.finish(prev.sessionId, {
            totalWords: prev.totalWords,
            correctAnswers: newCorrectTotal,
            sessionType: 'deep',
          });
        }
        return {
          ...prev,
          phase: 'complete',
          phaseIndex: nextPhaseIndex,
          correctTotal: newCorrectTotal,
          isTransitioning: false,
        };
      }

      // Show transition screen before moving to next phase
      return {
        ...prev,
        isTransitioning: true,
        lastPhase: prev.phase,
        lastPhaseCorrect: correctCount,
        correctTotal: newCorrectTotal,
        // phase stays the same until transition ends
      };
    });
  }, []);

  // Handle transition timer — advance phase after delay
  useEffect(() => {
    if (!state.isTransitioning) return;

    transitionTimerRef.current = setTimeout(() => {
      setState(prev => {
        if (!prev.isTransitioning) return prev;
        const nextPhase = getNextPhase(prev.lastPhase);
        const nextPhaseIndex = PHASE_ORDER.indexOf(nextPhase) + 1;

        return {
          ...prev,
          phase: nextPhase,
          phaseIndex: nextPhaseIndex,
          isTransitioning: false,
        };
      });
    }, TRANSITION_DELAY_MS);

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [state.isTransitioning]);

  // When phase changes — reload words for new exercise mode
  useEffect(() => {
    if (state.phase === 'complete' || state.allWordIds.length === 0) return;

    deepSessionRepository.loadWordsByIds(state.allWordIds).then(words => {
      setState(prev => ({ ...prev, wordsForPhase: words }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  return { state, isLoading, reportPhaseResult };
}
