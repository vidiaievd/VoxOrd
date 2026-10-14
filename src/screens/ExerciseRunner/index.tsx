import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseRunner } from '../../hooks/useExerciseRunner';
import { bodyOwnsCheck, ExerciseBody, type FooterAction } from './ExerciseBody';
import { FeedbackBar } from './FeedbackBar';
import { SetResultsScreen } from './SetResultsScreen';

interface ExerciseRunnerScreenProps {
  /** The exercise (content) ids in this set, in order. */
  exerciseIds: string[];
  /** Which item to open first. */
  startIndex: number;
  onBack: () => void;
  /** Called when the user leaves the results screen (or an empty set completes immediately). Navigating back to UnitContents remounts it, which refetches contents — no explicit refresh call needed. */
  onComplete: () => void;
  /**
   * Open the lesson this unit's exercises were set on — `multiple_choice_group`'s «To the
   * text» (plan 54 Q5). Absent for a unit with no text of its own, and then the link is
   * not drawn at all.
   */
  onOpenSourceLesson?: () => void;
}

export function ExerciseRunnerScreen({
  exerciseIds,
  startIndex,
  onBack,
  onComplete,
  onOpenSourceLesson,
}: ExerciseRunnerScreenProps) {
  const keyboardShown = useKeyboardShown();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const {
    state,
    progress,
    isLast,
    setAnswer,
    answerQuestion,
    checkRow,
    checkTable,
    finishTable,
    openAttempt,
    openedContent,
    check,
    advance,
    retry,
    retryAttempt,
  } = useExerciseRunner(exerciseIds, startIndex);

  /**
   * A body's own button in place of Check — `ExerciseBodyProps.setFooterAction`. A body that
   * sets it clears it when it unmounts, and the body is remounted for every item, so each
   * item starts with Check. Not reset from here: a parent's effect runs after its child's,
   * and would wipe the button the new body has just put up.
   */
  const [footerAction, setFooterAction] = useState<FooterAction | null>(null);

  const progressRatio = progress.total > 0 ? progress.current / progress.total : 0;

  // A non-empty finished set gets the full results summary (own SafeAreaView,
  // no header/progress-bar chrome); an empty set (edge case) falls through to
  // the plain "set complete" card below, since there's nothing to summarize.
  if (state.phase === 'complete' && state.results.length > 0) {
    return <SetResultsScreen results={state.results} onContinue={onComplete} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {t('exerciseRunner.progress', {
              current: progress.current,
              total: progress.total,
            })}
          </Text>
        </View>
      </View>

      {state.phase === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {state.phase === 'loadError' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('exerciseRunner.loadError')}</Text>
          {state.loadError ? <Text style={styles.emptyDesc}>{state.loadError}</Text> : null}
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.phase === 'complete' && (
        <View style={styles.centerFill}>
          <Text style={styles.completeEmoji}>🎉</Text>
          <Text style={styles.emptyTitle}>{t('exerciseRunner.setComplete')}</Text>
          <Text style={styles.emptyDesc}>{t('exerciseRunner.setCompleteDesc')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onComplete}>
            <Text style={styles.retryButtonText}>{t('exerciseRunner.done')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(state.phase === 'answering' ||
        state.phase === 'checking' ||
        state.phase === 'feedback') &&
        state.display && (
          // The fields of a body sit anywhere down the page; without this the keyboard
          // covers the one being typed in. `handled` lets a tap on a body's button land
          // while the keyboard is up instead of only closing it.
          <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={keyboardShown}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <ExerciseBody
                // Force a remount per item (mirrors the web reader's
                // key={contentId}) so a body's local input state (selection,
                // typed text) never leaks from one exercise to the next.
                // attemptSeq also forces a remount on a same-item retry.
                key={`${state.display.id}:${state.attemptSeq}`}
                display={state.display}
                phase={state.phase}
                disabled={state.phase !== 'answering'}
                verdict={state.verdict}
                onAnswerChange={setAnswer}
                answerQuestion={answerQuestion}
                checkRow={checkRow}
                checkTable={checkTable}
                finishTable={finishTable}
                openAttempt={openAttempt}
                openedContent={openedContent}
                onOpenSourceLesson={onOpenSourceLesson}
                setFooterAction={setFooterAction}
              />
            </ScrollView>

            {/* A body that runs its own checks draws its own controls, so while
                answering the footer bar would be an empty strip with a border. It
                comes back for the verdict, where Continue is «Fullfør» (plan 54
                §8 Q6), and for a body that put its own button there. */}
            {state.phase === 'feedback' ||
            footerAction !== null ||
            !bodyOwnsCheck(state.display.templateCode) ? (
              <View style={styles.footer}>
                {state.phase === 'feedback' && state.verdict ? (
                  <>
                    {/* A body that owns its check states the verdict itself, against the
                        pass mark. `verdict.correct` there means «every item right», so the
                        generic bar would say «Incorrect» over a passed board. */}
                    {bodyOwnsCheck(state.display.templateCode) ? null : (
                      <FeedbackBar verdict={state.verdict} />
                    )}
                    {!state.verdict.correct && !state.verdict.requiresReview ? (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={retryAttempt}>
                        <Text style={styles.secondaryBtnText}>{t('exerciseRunner.tryAgain')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.primaryBtn} onPress={advance}>
                      <Text style={styles.primaryBtnText}>
                        {isLast ? t('exerciseRunner.finish') : t('exerciseRunner.continue')}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : footerAction && state.phase === 'answering' ? (
                  <>
                    {footerAction.error ? (
                      <Text style={styles.footerError}>{footerAction.error}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        (footerAction.disabled || footerAction.busy) && styles.primaryBtnDisabled,
                      ]}
                      onPress={footerAction.onPress}
                      disabled={footerAction.disabled || footerAction.busy}
                    >
                      {footerAction.busy ? (
                        <ActivityIndicator size="small" color={colors.textInverted} />
                      ) : (
                        <Text style={styles.primaryBtnText}>{footerAction.label}</Text>
                      )}
                    </TouchableOpacity>
                    {footerAction.secondary ? (
                      <TouchableOpacity
                        style={styles.linkBtn}
                        onPress={footerAction.secondary.onPress}
                        disabled={footerAction.secondary.disabled || footerAction.busy}
                      >
                        <Text
                          style={[
                            styles.linkBtnText,
                            (footerAction.secondary.disabled || footerAction.busy) &&
                              styles.linkBtnTextDisabled,
                          ]}
                        >
                          {footerAction.secondary.label}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {footerAction.note ? (
                      <Text style={styles.footerNote}>{footerAction.note}</Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    {state.submitError ? (
                      <Text style={styles.footerError}>{state.submitError}</Text>
                    ) : null}
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
              </View>
            ) : null}
          </KeyboardAvoidingView>
        )}
    </SafeAreaView>
  );
}

/**
 * Whether the soft keyboard is up. The avoiding view is switched on only while it is: on Android
 * edge-to-edge the hide event still reports the navigation bar's inset as a keyboard, and an
 * always-on view kept that much empty space under the footer after every edit.
 */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 8,
      marginRight: 8,
    },
    backText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    progressWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginRight: 10,
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      minWidth: 40,
      textAlign: 'right',
    },
    centerFill: {
      flex: 1,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    completeEmoji: {
      fontSize: 44,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
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
    scroll: {
      padding: 20,
      flexGrow: 1,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerError: {
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: 8,
    },
    footerNote: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    secondaryBtn: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 10,
    },
    secondaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
    },
    linkBtn: {
      paddingVertical: 10,
      marginTop: 4,
      alignItems: 'center',
    },
    linkBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accent,
    },
    linkBtnTextDisabled: {
      opacity: 0.5,
    },
  });
