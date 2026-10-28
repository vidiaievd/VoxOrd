import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SessionHeader } from '../../../../components/practice';
import { Spinner, Tag } from '../../../../components/ui';
import { useTranslation } from '../../../../i18n';
import { ModeShell } from '../../ModeShell';
import { useTheme } from '../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../theme/colors';
import {
  usePronunciation,
  PronunciationMode,
} from '../../../../hooks/usePronunciation';

import { PronunciationCard } from './components/PronunciationCard';
import { TranscriptBox } from './components/TranscriptBox';
import { ScoreDisplay } from './components/ScoreDisplay';
import { RecordButton } from './components/RecordButton';
import { PronunciationResultScreen } from './PronunciationResultScreen';

interface PronunciationExerciseProps {
  deckId: number;
  mode?: PronunciationMode;
  onBack: () => void;
  onSessionDone: (sessionId: number) => void;
  onComplete?: (correctCount: number) => void;
}

export function PronunciationExercise({
  deckId,
  mode = 'mixed',
  onBack,
  onSessionDone,
  onComplete,
}: PronunciationExerciseProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { state, isLoading, speak, startRecord, stopRecord, next, retry, skip } =
    usePronunciation(deckId, mode, onComplete);

  // Auto-speak when item changes
  useEffect(() => {
    if (!isLoading && state.ttsReady && state.items.length > 0) {
      const timer = setTimeout(speak, 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, state.currentIndex, state.ttsReady]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Spinner size={28} color={colors.accent300} />
      </View>
    );
  }

  if (state.items.length === 0) {
    return (
      <ModeShell title={t('modes.pronunciation')} empty onBack={onBack}>
        {null}
      </ModeShell>
    );
  }

  // Deep session transition
  if (state.isComplete && onComplete) {
    return (
      <View style={styles.center}>
        <Spinner size={28} color={colors.accent300} />
      </View>
    );
  }

  // Standalone result screen
  if (state.isComplete) {
    return (
      <PronunciationResultScreen
        correctCount={state.correctCount}
        totalItems={state.totalItems}
        onContinue={() => onSessionDone(0)}
      />
    );
  }

  const item = state.items[state.currentIndex];
  const isLast = state.currentIndex + 1 >= state.items.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SessionHeader
        title={t('modes.pronunciation')}
        leadingLabel={t('common.close')}
        onLeading={onBack}
        counter={`${Math.min(state.currentIndex + 1, state.totalItems)}/${state.totalItems}`}
      />

      <View style={styles.badgeRow}>
        <Tag variant="neutral" label={item.type === 'word' ? t('modes.itemWord') : t('modes.itemPhrase')} />
        <Text style={styles.difficultyText}>
          {'★'.repeat(item.difficulty)}
          {'☆'.repeat(3 - item.difficulty)}
        </Text>
      </View>

      {/* Card */}
      <PronunciationCard
        item={item}
        isSpeaking={state.isSpeaking}
        showText={state.recordingState === 'result'}
        onSpeak={speak}
      />

      {/* Transcript */}
      {state.transcript !== null && (
        <TranscriptBox transcript={state.transcript} />
      )}

      {/* Score */}
      {state.score !== null && <ScoreDisplay score={state.score} />}

      {/* Error */}
      {state.error !== null && (
        <Text style={styles.errorText}>⚠️ {state.error}</Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <RecordButton
          recordingState={state.recordingState}
          onStart={startRecord}
          onStop={stopRecord}
          onRetry={retry}
          onNext={next}
          onSkip={skip}
          isLast={isLast}
          isDeepSession={!!onComplete}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    difficultyText: {
      fontSize: 14,
      color: colors.accent,
    },
    controls: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      alignItems: 'center',
      marginTop: 'auto',
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      textAlign: 'center',
      marginHorizontal: 20,
      marginBottom: 12,
    },
  });
