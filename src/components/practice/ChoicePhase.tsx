import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useQuiz } from '../../hooks/useQuiz';
import { useListening } from '../../hooks/useListening';
import { useAutoAdvance } from '../../hooks/useAutoAdvance';
import type { ExerciseTracking } from '../../hooks/exerciseTracking';
import type { AnswerState } from '../ui/answerTone';
import { Button } from '../ui/Button';
import { ChoiceOption } from '../ui/ChoiceOption';
import { Overline } from '../ui/Overline';
import { Skeleton } from '../ui/Skeleton';
import { PhaseFooter } from './PhaseFooter';
import { useSpeakWord } from './useSpeakWord';

export interface ChoicePhaseProps {
  deckId: number;
  languageCode: string;
  wordIds: number[];
  tracking: ExerciseTracking;
  onDone: () => void;
  onProgress?: (index: number, total: number) => void;
}

interface ChoiceQuestion {
  word: string;
  correctAnswer: string;
  options: string[];
}

interface ChoiceViewProps {
  overline: string;
  /** The word, or the big speaker of the listening phase. */
  prompt: React.ReactNode;
  question: ChoiceQuestion;
  /** Index of the question on screen — a new one clears the local pick. */
  index: number;
  isAnswered: boolean;
  isCorrect: boolean | null;
  selectedOption: string | null;
  /** Records the answer: `selectOption` of the phase's hook, called at «Check». */
  onCheck: (option: string) => void;
  onNext: () => void;
}

/**
 * The «pick the translation» body shared by the quiz and listening phases (Practice §7.3,
 * 6d). Picking an option only marks it; «Check» hands it to the hook, which records the
 * answer exactly as a tap used to (C2: the evidence carries no response time, so moving the
 * moment from the tap to «Check» changes nothing it measures).
 */
function ChoiceView({
  overline,
  prompt,
  question,
  index,
  isAnswered,
  isCorrect,
  selectedOption,
  onCheck,
  onNext,
}: ChoiceViewProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => setPicked(null), [index]);

  const stateOf = (option: string): AnswerState => {
    if (!isAnswered) return option === picked ? 'selected' : 'idle';
    if (option === question.correctAnswer) return 'right';
    if (option === selectedOption) return 'wrong';
    return 'rest';
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20, gap: 22 }}
      >
        <View style={{ gap: 10 }}>
          <Overline>{overline}</Overline>
          {prompt}
        </View>
        <View style={{ gap: 10 }}>
          {question.options.map(option => (
            <ChoiceOption
              key={option}
              label={option}
              state={stateOf(option)}
              disabled={isAnswered}
              onPress={() => setPicked(option)}
              style={{ minHeight: 52 }}
            />
          ))}
        </View>
      </ScrollView>
      <PhaseFooter
        feedback={
          isAnswered
            ? isCorrect
              ? { icon: 'CheckCircle', title: t('reviewSession.correct') }
              : {
                  icon: 'Info',
                  title: t('reviewSession.correctIs', { answer: question.correctAnswer }),
                }
            : null
        }
      >
        {isAnswered ? (
          <Button block label={t('reviewSession.next')} onPress={onNext} />
        ) : (
          <Button
            block
            label={t('reviewSession.check')}
            disabled={picked === null}
            onPress={() => picked !== null && onCheck(picked)}
          />
        )}
      </PhaseFooter>
    </View>
  );
}

function PhaseSkeleton() {
  return (
    <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 10 }}>
      <Skeleton width={140} height={12} />
      <Skeleton width={180} height={36} />
      {[0, 1, 2, 3].map(i => (
        <Skeleton key={i} height={52} />
      ))}
    </View>
  );
}

/** Reports «{i}/{n}» up, and an empty question set as a finished phase (no dead end). */
function usePhaseLifecycle(
  isLoading: boolean,
  index: number,
  total: number,
  onDone: () => void,
  onProgress?: (index: number, total: number) => void,
) {
  useEffect(() => {
    if (!isLoading && total === 0) onDone();
  }, [isLoading, total, onDone]);
  useEffect(() => {
    if (!isLoading && total > 0) onProgress?.(Math.min(index + 1, total), total);
  }, [isLoading, index, total, onProgress]);
}

/** «Pick the translation» (6d) over `useQuiz`. */
export function QuizPhase({
  deckId,
  languageCode,
  wordIds,
  tracking,
  onDone,
  onProgress,
}: ChoicePhaseProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { speak, canSpeak } = useSpeakWord(languageCode);
  const { state, isLoading, selectOption, next } = useQuiz(
    deckId,
    wordIds,
    onDone,
    tracking,
  );
  usePhaseLifecycle(isLoading, state.currentIndex, state.questions.length, onDone, onProgress);
  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  const question = state.questions[state.currentIndex];
  if (isLoading) return <PhaseSkeleton />;
  if (!question || state.isComplete) return null;

  return (
    <ChoiceView
      overline={t('reviewSession.pickTranslation')}
      prompt={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontSize: 32,
              lineHeight: 38,
              fontWeight: '500',
              color: colors.text,
            }}
          >
            {question.word}
          </Text>
          {canSpeak ? (
            <Button
              variant="ghost"
              size={40}
              iconOnly
              icon="SpeakerHigh"
              accessibilityLabel={t('reviewSession.listen')}
              onPress={() => speak(question.word)}
            />
          ) : null}
        </View>
      }
      question={question}
      index={state.currentIndex}
      isAnswered={state.isAnswered}
      isCorrect={state.isCorrect}
      selectedOption={state.selectedOption}
      onCheck={selectOption}
      onNext={next}
    />
  );
}

/** «Listen and pick the meaning» over `useListening`, which speaks each word itself. */
export function ListeningPhase({
  deckId,
  wordIds,
  tracking,
  onDone,
  onProgress,
}: ChoicePhaseProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { state, isLoading, speak, selectOption, next, installTts } = useListening(
    deckId,
    wordIds,
    onDone,
    tracking,
  );
  usePhaseLifecycle(isLoading, state.currentIndex, state.questions.length, onDone, onProgress);
  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  if (state.ttsStatus === 'no_engine' || state.ttsStatus === 'error') {
    const missing = state.ttsStatus === 'no_engine';
    return (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 }}>
        <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '500', color: colors.text }}>
          {missing ? t('reviewSession.ttsMissing') : t('reviewSession.ttsError')}
        </Text>
        {missing ? (
          <>
            <Text style={[typography.body, { color: colors.neutral400 }]}>
              {t('reviewSession.ttsMissingBody')}
            </Text>
            <Button label={t('reviewSession.ttsInstall')} onPress={installTts} />
          </>
        ) : null}
      </View>
    );
  }

  const question = state.questions[state.currentIndex];
  if (isLoading || state.ttsStatus === 'initializing') return <PhaseSkeleton />;
  if (!question || state.isComplete) return null;

  return (
    <ChoiceView
      overline={t('reviewSession.listenPick')}
      prompt={
        <Button
          variant="secondary"
          size={52}
          iconOnly
          icon="SpeakerHigh"
          accessibilityLabel={t('reviewSession.listen')}
          onPress={speak}
          style={{ width: 64, height: 64 }}
        />
      }
      question={question}
      index={state.currentIndex}
      isAnswered={state.isAnswered}
      isCorrect={state.isCorrect}
      selectedOption={state.selectedOption}
      onCheck={selectOption}
      onNext={next}
    />
  );
}
