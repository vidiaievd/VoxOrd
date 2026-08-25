import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useExerciseRunner } from '../../../hooks/useExerciseRunner';
import { ExerciseBody } from '../../ExerciseRunner/ExerciseBody';
import { FeedbackBar } from '../../ExerciseRunner/FeedbackBar';
import { AudioPlayer } from './AudioPlayer';

interface ExerciseStageProps {
  /** In position order — see groupListeningStages. */
  exerciseIds: string[];
  headingKey: string;
  bodyKey: string;
  mediaId: string | null;
  audioLabel: string;
  /** Called once the whole stage's exercise set is finished (server-graded). */
  onComplete: () => void;
}

/**
 * Runs a listening stage's exercises (gap-fill or comprehension — same
 * mechanics, so one component covers both) through the existing per-item
 * runner (`useExerciseRunner`) and its already-built `fill_in_blank` /
 * `multiple_choice` bodies, one exercise at a time with server-side grading.
 *
 * This deliberately diverges from the web reader's UX (fill every blank,
 * then "Check answers" once for the whole stage, graded client-side against
 * a fetched answer key) — VoxOrd never grades client-side (see
 * src/api/exercises.ts), and reusing the existing per-item Check/Continue
 * flow needed no new grading logic at all. There is no intermediate "set
 * complete" screen here (unlike `ExerciseRunnerScreen`): reaching `complete`
 * immediately calls `onComplete`, advancing the outer listening flow.
 */
export function ExerciseStage({
  exerciseIds,
  headingKey,
  bodyKey,
  mediaId,
  audioLabel,
  onComplete,
}: ExerciseStageProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, progress, isLast, setAnswer, answerQuestion, check, advance, retry } = useExerciseRunner(
    exerciseIds,
    0,
  );

  useEffect(() => {
    if (state.phase === 'complete') onComplete();
  }, [state.phase, onComplete]);

  if (state.phase === 'complete') return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t(headingKey)}</Text>
      <Text style={styles.body}>{t(bodyKey)}</Text>
      <View style={styles.player}>
        <AudioPlayer mediaId={mediaId} label={audioLabel} compact />
      </View>

      <Text style={styles.progress}>
        {t('exerciseRunner.progress', { current: progress.current, total: progress.total })}
      </Text>

      {state.phase === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {state.phase === 'loadError' && (
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>{t('exerciseRunner.loadError')}</Text>
          {state.loadError ? <Text style={styles.errorDesc}>{state.loadError}</Text> : null}
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(state.phase === 'answering' || state.phase === 'checking' || state.phase === 'feedback') &&
        state.display && (
          <>
            <ExerciseBody
              key={state.display.id}
              display={state.display}
              phase={state.phase}
              disabled={state.phase !== 'answering'}
              verdict={state.verdict}
              onAnswerChange={setAnswer}
              answerQuestion={answerQuestion}
            />

            {state.phase === 'feedback' && state.verdict ? (
              <>
                <FeedbackBar verdict={state.verdict} />
                <TouchableOpacity style={styles.primaryBtn} onPress={advance}>
                  <Text style={styles.primaryBtnText}>
                    {isLast ? t('exerciseRunner.finish') : t('exerciseRunner.continue')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {state.submitError ? <Text style={styles.errorDesc}>{state.submitError}</Text> : null}
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (!state.canSubmit || state.phase === 'checking') && styles.primaryBtnDisabled,
                  ]}
                  onPress={check}
                  disabled={!state.canSubmit || state.phase === 'checking'}
                >
                  {state.phase === 'checking' ? (
                    <ActivityIndicator size="small" color={colors.textInverted} />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('exerciseRunner.check')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      padding: 20,
    },
    heading: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    body: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    player: {
      marginBottom: 16,
    },
    progress: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 12,
    },
    centerFill: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    errorTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    errorDesc: {
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: 8,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryBtnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });
