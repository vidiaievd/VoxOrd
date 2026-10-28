import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Button, ProgressTrack, Spinner } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useModal } from '../../providers/ModalProvider';
import { useBackIntercept } from '../../navigation/backIntercept';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseRunner } from '../../hooks/useExerciseRunner';
import { bodyOwnsCheck, ExerciseBody, type FooterAction } from './ExerciseBody';
import { AiVerdict } from './AiVerdict';
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
  const insets = useSafeAreaInsets();
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

  const { show } = useModal();
  /*
    Leaving a set mid-way asks first — the arrow and the phone's Back alike. What was handed
    in is on the server already; what is lost is the answer on screen, not sent yet. Nothing
    to ask once the set is finished, or before an item has even loaded.
  */
  const midSet =
    state.phase === 'answering' ||
    state.phase === 'checking' ||
    state.phase === 'feedback';
  const leave = useCallback(() => {
    if (!midSet) {
      onBack();
      return;
    }
    show({
      type: 'confirm',
      title: t('exerciseRunner.leave.title'),
      message: t('exerciseRunner.leave.message'),
      confirmLabel: t('exerciseRunner.leave.confirm'),
      cancelLabel: t('exerciseRunner.leave.stay'),
      onConfirm: onBack,
    });
  }, [midSet, onBack, show, t]);
  useBackIntercept(() => {
    leave();
    return true;
  });

  // A non-empty finished set gets the full results summary (own SafeAreaView,
  // no header/progress-bar chrome); an empty set (edge case) falls through to
  // the plain "set complete" card below, since there's nothing to summarize.
  if (state.phase === 'complete' && state.results.length > 0) {
    return <SetResultsScreen results={state.results} onContinue={onComplete} />;
  }

  const inItem =
    (state.phase === 'answering' ||
      state.phase === 'checking' ||
      state.phase === 'feedback') &&
    state.display !== null;
  // A body that runs its own checks draws its own controls, so while answering the footer
  // would be an empty strip. It comes back for the verdict, where Continue is «Fullfør» (plan
  // 54 §8 Q6), and for a body that put its own button there.
  const footerShown =
    inItem &&
    (state.phase === 'feedback' ||
      footerAction !== null ||
      !bodyOwnsCheck(state.display!.templateCode));
  const onSurface = state.phase === 'feedback' && state.verdict !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Button
          variant="ghost"
          size={44}
          iconOnly
          icon="X"
          accessibilityLabel={t('exerciseRunner.close')}
          onPress={leave}
        />
        <SetProgress current={progress.current} total={progress.total} />
        <Text style={styles.progressLabel}>
          {t('exerciseRunner.progress', {
            current: progress.current,
            total: progress.total,
          })}
        </Text>
      </View>

      {state.phase === 'loading' && (
        <View style={styles.centerFill}>
          <Spinner size={24} color={colors.neutral400} />
        </View>
      )}

      {state.phase === 'loadError' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('exerciseRunner.loadError')}</Text>
          {state.loadError ? (
            <Text style={styles.emptyDesc}>{state.loadError}</Text>
          ) : null}
          <Button
            variant="secondary"
            size={44}
            label={t('courses.retry')}
            onPress={retry}
            style={styles.centerButton}
          />
        </View>
      )}

      {state.phase === 'complete' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>
            {t('exerciseRunner.setComplete')}
          </Text>
          <Text style={styles.emptyDesc}>
            {t('exerciseRunner.setCompleteDesc')}
          </Text>
          <Button
            size={44}
            label={t('exerciseRunner.done')}
            onPress={onComplete}
            style={styles.centerButton}
          />
        </View>
      )}

      {inItem && state.display && (
        // The fields of a body sit anywhere down the page; without this the keyboard
        // covers the one being typed in. `handled` lets a tap on a body's button land
        // while the keyboard is up instead of only closing it.
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          enabled={keyboardShown}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
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
            {/* A model reads the work of a learner nobody reviews (plan 79, 2.3d): its
                verdict and review land under the work, while the footer says it went in. */}
            {state.phase === 'feedback' &&
            state.verdict?.requiresReview &&
            state.verdict.reviewer === 'ai' ? (
              <AiVerdict
                key={state.verdict.attemptId}
                exerciseId={state.exerciseIds[state.idx]}
                attemptId={state.verdict.attemptId}
                templateCode={state.display.templateCode}
              />
            ) : null}
          </ScrollView>

          {footerShown ? (
            <View
              style={[
                styles.footer,
                onSurface && styles.footerOnSurface,
                { paddingBottom: 12 + (keyboardShown ? 0 : insets.bottom) },
              ]}
            >
              {state.phase === 'feedback' && state.verdict ? (
                <>
                  {/* A body that owns its check states the verdict itself, against the
                      pass mark. `verdict.correct` there means «every item right», so the
                      generic bar would say «Incorrect» over a passed board. */}
                  {bodyOwnsCheck(state.display.templateCode) ? null : (
                    <View style={styles.feedback}>
                      <FeedbackBar verdict={state.verdict} />
                    </View>
                  )}
                  {!state.verdict.correct && !state.verdict.requiresReview ? (
                    <Button
                      variant="secondary"
                      size={44}
                      block
                      label={t('exerciseRunner.tryAgain')}
                      onPress={retryAttempt}
                    />
                  ) : null}
                  <Button
                    size={52}
                    block
                    label={
                      isLast
                        ? t('exerciseRunner.finish')
                        : t('exerciseRunner.continue')
                    }
                    onPress={advance}
                  />
                </>
              ) : footerAction && state.phase === 'answering' ? (
                <>
                  {footerAction.error ? (
                    <Text style={styles.footerError}>{footerAction.error}</Text>
                  ) : null}
                  <Button
                    size={52}
                    block
                    label={footerAction.label}
                    disabled={footerAction.disabled}
                    busy={footerAction.busy}
                    onPress={footerAction.onPress}
                  />
                  {footerAction.secondary ? (
                    <Button
                      variant="ghost"
                      size={44}
                      block
                      label={footerAction.secondary.label}
                      disabled={
                        footerAction.secondary.disabled || footerAction.busy
                      }
                      onPress={footerAction.secondary.onPress}
                    />
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
                  <Button
                    size={52}
                    block
                    label={
                      handsIn(state.display.templateCode)
                        ? t('exerciseRunner.send')
                        : t('exerciseRunner.check')
                    }
                    disabled={!state.canSubmit}
                    busy={state.phase === 'checking'}
                    onPress={check}
                  />
                </>
              )}
            </View>
          ) : (
            <View style={{ height: insets.bottom }} />
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/**
 * Work that is handed in to be read rather than checked on the spot — its footer says
 * «Отправить» (Courses §8.5). `read_aloud`, the other one, draws its own button.
 */
function handsIn(templateCode: string): boolean {
  return templateCode === 'writing_task';
}

/** Above this many items the segments get too thin to read; one track instead (Courses §8.5). */
const MAX_SEGMENTS = 12;

/** One segment per item of the set: done `accent`, current `accent700`, ahead `neutral800`. */
function SetProgress({ current, total }: { current: number; total: number }) {
  const { colors } = useTheme();
  if (total > MAX_SEGMENTS) {
    return (
      <View style={{ flex: 1 }}>
        <ProgressTrack value={total > 0 ? (current - 1) / total : 0} />
      </View>
    );
  }
  return (
    <View
      style={{ flex: 1, flexDirection: 'row', gap: 4 }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor:
              i + 1 < current
                ? colors.accentBase
                : i + 1 === current
                ? colors.accent700
                : colors.neutral800,
          }}
        />
      ))}
    </View>
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
      backgroundColor: colors.bg,
    },
    header: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 4,
      paddingRight: 8,
    },
    progressLabel: {
      fontSize: 12,
      color: colors.neutral400,
      paddingRight: 12,
    },
    centerFill: {
      flex: 1,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.neutral500,
      textAlign: 'center',
      lineHeight: 19,
    },
    centerButton: {
      marginTop: 16,
      alignSelf: 'center',
    },
    scroll: {
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 24,
      flexGrow: 1,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 10,
    },
    footerOnSurface: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.neutral800,
      paddingTop: 14,
    },
    feedback: {
      marginBottom: 4,
    },
    footerError: {
      fontSize: 13,
      color: colors.neutral400,
      textAlign: 'center',
    },
    footerNote: {
      fontSize: 12,
      color: colors.neutral500,
      textAlign: 'center',
    },
  });
