import { useState, useCallback, useEffect } from 'react';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { sessionRepository } from '../repositories/SessionRepository';

export type DeepPhase = 'flashcard' | 'quiz' | 'spelling' | 'complete';

export interface DeepSessionWord {
  wordId: number;
  word: string;
  translation: string;
}

export interface DeepSessionState {
  phase: DeepPhase;
  phaseIndex: number; // 1, 2, 3
  totalPhases: number; // сколько фаз будет (1-3)
  wordsForPhase: DeepSessionWord[];
  weakWordIds: Set<number>; // слова с ошибками — переходят в след фазу
  sessionId: number | null;
  totalWords: number;
  correctTotal: number;
}

export interface UseDeepSessionResult {
  state: DeepSessionState;
  isLoading: boolean;
  reportPhaseResult: (weakIds: number[], correctCount: number) => void;
}

async function loadWords(
  deckId: number,
  uiLang: string = 'ru',
  wordIds?: number[],
): Promise<DeepSessionWord[]> {
  const db = getDatabase();

  if (wordIds && wordIds.length === 0) return [];

  const whereClause = wordIds ? `AND w.id IN (${wordIds.join(',')})` : '';

  const result = await db.execute(
    `SELECT
       w.id          AS wordId,
       w.word,
       t.translation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
     ${whereClause}
     ORDER BY RANDOM()
     LIMIT 20;`,
    [deckId, uiLang],
  );

  return (result.rows ?? []).map(r => ({
    wordId: r.wordId as number,
    word: r.word as string,
    translation: r.translation as string,
  }));
}

export function useDeepSession(deckId: number): UseDeepSessionResult {
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<DeepSessionState>({
    phase: 'flashcard',
    phaseIndex: 1,
    totalPhases: 3,
    wordsForPhase: [],
    weakWordIds: new Set(),
    sessionId: null,
    totalWords: 0,
    correctTotal: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, words] = await Promise.all([
        sessionRepository.create('deep', deckId),
        loadWords(deckId),
      ]);
      if (!cancelled) {
        setState(prev => ({
          ...prev,
          phase: 'flashcard',
          phaseIndex: 1,
          wordsForPhase: words,
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

  // Called by each exercise when it finishes
  // weakIds = wordIds where user made mistakes
  const reportPhaseResult = useCallback(
    (weakIds: number[], correctCount: number) => {
      setState(prev => {
        const newCorrectTotal = prev.correctTotal + correctCount;
        const newWeakIds = new Set(weakIds);

        // Determine next phase
        let nextPhase: DeepPhase;
        let nextPhaseIndex = prev.phaseIndex + 1;

        if (prev.phase === 'flashcard') {
          if (weakIds.length > 0) {
            nextPhase = 'quiz';
          } else {
            // All correct on flashcard — skip quiz+spelling
            nextPhase = 'complete';
            nextPhaseIndex = prev.totalPhases;
            if (prev.sessionId) {
              sessionRepository.finish(prev.sessionId, {
                totalWords: prev.totalWords,
                correctAnswers: newCorrectTotal,
                sessionType: 'deep',
              });
            }
          }
        } else if (prev.phase === 'quiz') {
          if (weakIds.length > 0) {
            nextPhase = 'spelling';
          } else {
            nextPhase = 'complete';
            if (prev.sessionId) {
              sessionRepository.finish(prev.sessionId, {
                totalWords: prev.totalWords,
                correctAnswers: newCorrectTotal,
                sessionType: 'deep',
              });
            }
          }
        } else {
          // spelling done — always complete
          nextPhase = 'complete';
          if (prev.sessionId) {
            sessionRepository.finish(prev.sessionId, {
              totalWords: prev.totalWords,
              correctAnswers: newCorrectTotal,
              sessionType: 'deep',
            });
          }
        }

        //TODO: log phase results for analytics
        console.log('[Deep] phase:', prev.phase, '→', nextPhase);
        console.log('[Deep] weakIds:', weakIds);
        //TODO: end log
        return {
          ...prev,
          phase: nextPhase,
          phaseIndex: nextPhaseIndex,
          weakWordIds: newWeakIds,
          correctTotal: newCorrectTotal,
          // wordsForPhase will be updated by the next useEffect
        };
      });
    },
    [],
  );

  // When phase changes to quiz/spelling — filter words to weak ones
  useEffect(() => {
    if (state.phase === 'quiz' || state.phase === 'spelling') {
      const weakIds = Array.from(state.weakWordIds);
      if (weakIds.length === 0) return;

      loadWords(deckId, 'ru', weakIds).then(words => {
        setState(prev => ({ ...prev, wordsForPhase: words }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  return { state, isLoading, reportPhaseResult };
}
