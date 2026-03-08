import { useState, useCallback, useEffect } from 'react';
import { getDatabase } from '../db/database';
import { TABLE } from '../db/types';
import { progressRepository } from '../repositories/ProgressRepository';
import { sessionRepository } from '../repositories/SessionRepository';

export interface MatchingPair {
  wordId: number;
  word: string;
  translation: string;
}

export interface MatchingState {
  pairs: MatchingPair[];
  selectedWordId: number | null; // selected in left column
  selectedTransId: number | null; // selected in right column
  matched: Set<number>; // correctly matched wordIds
  mistakeWordIds: Set<number>; // mistake highlight for left column
  mistakeTransIds: Set<number>; // mistake highlight for right column
  isComplete: boolean;
}

export interface UseMatchingResult {
  state: MatchingState;
  isLoading: boolean;
  sessionId: number | null;
  selectWord: (wordId: number) => void;
  selectTrans: (wordId: number) => void;
}

const PAIR_COUNT = 5;
const MISTAKE_RESET_DELAY_MS = 800;

async function loadPairs(
  deckId: number,
  uiLang: string = 'ru',
): Promise<MatchingPair[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT
       w.id     AS wordId,
       w.word,
       t.translation
     FROM ${TABLE.WORDS}        w
     JOIN ${TABLE.DECK_WORDS}   dw ON dw.wordId = w.id AND dw.deckId = ?
     JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId  = w.id AND t.languageCode = ?
     ORDER BY RANDOM()
     LIMIT ?;`,
    [deckId, uiLang, PAIR_COUNT],
  );

  return (result.rows ?? []).map(row => ({
    wordId: row.wordId as number,
    word: row.word as string,
    translation: row.translation as string,
  }));
}

export function useMatching(deckId: number): UseMatchingResult {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<MatchingState>({
    pairs: [],
    selectedWordId: null,
    selectedTransId: null,
    matched: new Set(),
    mistakeWordIds: new Set(),
    mistakeTransIds: new Set(),
    isComplete: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [sid, pairs] = await Promise.all([
        sessionRepository.create('quick', deckId),
        loadPairs(deckId),
      ]);
      if (!cancelled) {
        setSessionId(sid);
        setState(prev => ({ ...prev, pairs }));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Attempt to match currently selected word + translation
  const tryMatch = useCallback(
    (
      wordId: number,
      transId: number,
      sid: number | null,
      pairs: MatchingPair[],
    ) => {
      const isCorrect = wordId === transId;

      // Fire-and-forget — no need to await in setState
      progressRepository.recordAnswer(wordId, deckId, isCorrect);
      if (sid) {
        sessionRepository.recordResult({
          sessionId: sid,
          wordId,
          exerciseType: 'matching',
          isCorrect,
          responseTimeMs: null,
        });
      }

      if (isCorrect) {
        setState(prev => {
          const matched = new Set(prev.matched);
          matched.add(wordId);
          const isComplete = matched.size === pairs.length;

          if (isComplete && sid) {
            sessionRepository.finish(sid, {
              totalWords: pairs.length,
              correctAnswers: matched.size,
              sessionType: 'quick',
            });
          }

          return {
            ...prev,
            selectedWordId: null,
            selectedTransId: null,
            matched,
            isComplete,
          };
        });
      } else {
        // Highlight mistake separately in each column
        setState(prev => ({
          ...prev,
          selectedWordId: null,
          selectedTransId: null,
          mistakeWordIds: new Set([wordId]),
          mistakeTransIds: new Set([transId]),
        }));

        // Auto-clear mistake highlight after delay
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            mistakeWordIds: new Set(),
            mistakeTransIds: new Set(),
          }));
        }, MISTAKE_RESET_DELAY_MS);
      }
    },
    [deckId],
  );

  const selectWord = useCallback(
    (wordId: number) => {
      setState(prev => {
        if (prev.matched.has(wordId)) return prev;

        // If translation already selected — attempt match immediately
        if (prev.selectedTransId !== null) {
          // Schedule outside setState to avoid side effects inside reducer
          setTimeout(
            () =>
              tryMatch(wordId, prev.selectedTransId!, sessionId, prev.pairs),
            0,
          );
          return { ...prev, selectedWordId: wordId };
        }

        return {
          ...prev,
          selectedWordId: wordId,
          mistakeWordIds: new Set(),
          mistakeTransIds: new Set(),
        };
      });
    },
    [sessionId, tryMatch],
  );

  const selectTrans = useCallback(
    (transId: number) => {
      setState(prev => {
        if (prev.matched.has(transId)) return prev;

        if (prev.selectedWordId !== null) {
          setTimeout(
            () =>
              tryMatch(prev.selectedWordId!, transId, sessionId, prev.pairs),
            0,
          );
          return { ...prev, selectedTransId: transId };
        }

        return {
          ...prev,
          selectedTransId: transId,
          mistakeWordIds: new Set(),
          mistakeTransIds: new Set(),
        };
      });
    },
    [sessionId, tryMatch],
  );

  return { state, isLoading, sessionId, selectWord, selectTrans };
}
