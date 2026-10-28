import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { ChoiceView, PhaseSkeleton } from '../../../components/practice/ChoicePhase';
import { useAutoAdvance } from '../../../hooks/useAutoAdvance';
import { useContext } from '../../../hooks/useContext';
import { useOwnedTracking } from '../../../hooks/usePersonalSession';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import type { Deck } from '../../../repositories/DeckRepository';
import { ModeShell } from '../ModeShell';

interface ContextExerciseProps {
  deck: Deck;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
}

const GAP_MARKER = '___';

/**
 * «Context» (Practice §8.3): the sentence with its gap, the translation under it, then the
 * same pick-and-check options as the quiz. Answered, the gap shows the right word.
 */
export function ContextExercise({ deck, onBack, onSessionDone }: ContextExerciseProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  // Context is only ever run standalone — neither CourseReviewPhase nor Deep
  // Session's PHASE_ORDER includes it — so it always owns its session.
  const session = useOwnedTracking(deck.id, 'context');
  const { state, isLoading, sessionId, selectOption, next } = useContext(deck.id, session);
  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  useEffect(() => {
    if (state.isComplete) onSessionDone(sessionId ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isComplete]);

  const question = state.questions[state.currentIndex];
  const empty = !isLoading && state.questions.length === 0;
  const counter =
    state.questions.length > 0
      ? `${Math.min(state.currentIndex + 1, state.questions.length)}/${state.questions.length}`
      : undefined;

  const [before, after = ''] = question ? question.sentence.split(GAP_MARKER) : ['', ''];

  return (
    <ModeShell title={t('modes.context')} counter={counter} empty={empty} onBack={onBack}>
      {isLoading ? (
        <PhaseSkeleton />
      ) : !question || state.isComplete ? null : (
        <ChoiceView
          overline={t('modes.contextDesc')}
          prompt={
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 22, lineHeight: 30, fontWeight: '500', color: colors.text }}>
                {before}
                <Text
                  style={{
                    color: !state.isAnswered
                      ? colors.neutral500
                      : state.isCorrect
                        ? colors.accent300
                        : colors.text,
                  }}
                >
                  {state.isAnswered ? question.correctAnswer : GAP_MARKER}
                </Text>
                {after}
              </Text>
              <Text style={[typography.secondary, { color: colors.neutral400 }]}>
                {question.sentenceTranslation}
              </Text>
            </View>
          }
          question={{
            word: question.sentence,
            correctAnswer: question.correctAnswer,
            options: question.options,
          }}
          index={state.currentIndex}
          isAnswered={state.isAnswered}
          isCorrect={state.isCorrect}
          selectedOption={state.selectedOption}
          onCheck={selectOption}
          onNext={next}
        />
      )}
    </ModeShell>
  );
}
