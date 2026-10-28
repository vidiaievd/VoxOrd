import React, { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { ChoiceOption, Overline, Skeleton } from '../../../components/ui';
import type { AnswerState } from '../../../components/ui/answerTone';
import { useMatching } from '../../../hooks/useMatching';
import { useTranslation } from '../../../i18n';
import type { Deck } from '../../../repositories/DeckRepository';
import { ModeShell } from '../ModeShell';

interface MatchingExerciseProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

/**
 * «Pairs» (Practice §8.3): two columns of the §7.3 options — a word on the left, its
 * translation on the right. A pair that fits turns right; a wrong one flashes and resets.
 * The last pair goes straight to the results screen.
 */
export function MatchingExercise({ deck, onBack, onSessionDone }: MatchingExerciseProps) {
  const { t } = useTranslation();
  const { state, isLoading, sessionId, selectWord, selectTrans } = useMatching(deck.id);

  // Shuffle translations independently from words
  const shuffledTrans = useMemo(
    () => [...state.pairs].sort(() => Math.random() - 0.5),
    [state.pairs],
  );

  useEffect(() => {
    if (state.isComplete) onSessionDone(sessionId ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isComplete]);

  const empty = !isLoading && state.pairs.length === 0;
  const counter = state.pairs.length > 0 ? `${state.matched.size}/${state.pairs.length}` : undefined;

  const stateOf = (
    wordId: number,
    mistakes: Set<number>,
    selected: number | null,
  ): AnswerState => {
    if (state.matched.has(wordId)) return 'right';
    if (mistakes.has(wordId)) return 'wrong';
    if (selected === wordId) return 'selected';
    return 'idle';
  };

  return (
    <ModeShell title={t('modes.matching')} counter={counter} empty={empty} onBack={onBack}>
      {isLoading ? (
        <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 10 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} height={52} />
          ))}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}
        >
          <Overline>{t('modes.matchingDesc')}</Overline>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 10 }}>
              {state.pairs.map(pair => (
                <ChoiceOption
                  key={`word-${pair.wordId}`}
                  label={pair.word}
                  state={stateOf(pair.wordId, state.mistakeWordIds, state.selectedWordId)}
                  disabled={state.matched.has(pair.wordId)}
                  onPress={() => selectWord(pair.wordId)}
                />
              ))}
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              {shuffledTrans.map(pair => (
                <ChoiceOption
                  key={`trans-${pair.wordId}`}
                  label={pair.translation}
                  state={stateOf(pair.wordId, state.mistakeTransIds, state.selectedTransId)}
                  disabled={state.matched.has(pair.wordId)}
                  onPress={() => selectTrans(pair.wordId)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </ModeShell>
  );
}
