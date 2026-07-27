import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import {
  primarySet,
  useCourseReviewSets,
} from '../../hooks/useCourseReviewSets';
import { useCourseReviewSession } from '../../hooks/useCourseReviewSession';
import type { DeckReviewSet } from '../../lib/courseReviewLoader';
import type { Deck } from '../../repositories/DeckRepository';
import { OfflineBanner } from '../../components/OfflineBanner';
import { CardScreen } from '../CardScreen';
import { QuizExercise } from '../LearningScreen/exercises/QuizExercise';
import { SpellingExercise } from '../LearningScreen/exercises/SpellingExercise';
import { ListeningExercise } from '../LearningScreen/exercises/ListeningExercise';
import { PhaseTracker } from './PhaseTracker';
import { SessionSummary } from './SessionSummary';

interface ReviewSessionScreenProps {
  onBack: () => void;
}

/**
 * Course-word review session.
 *
 * The rating sent to the server is **derived from what the user did**, never
 * self-reported: the same due words are drilled through listening, quiz and
 * spelling, per-word evidence accumulates, and one FSRS rating per card is
 * posted at the end. Scheduling itself happens entirely server-side — this
 * screen computes no intervals.
 *
 * Personal VoxOrd words are untouched: only words imported from a platform
 * vocabulary list can appear here, and their local 6-stage progress is
 * deliberately not written during the session.
 */
export function ReviewSessionScreen({ onBack }: ReviewSessionScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { loading, error, offline, overview, decks, reload } = useCourseReviewSets();

  const set = primarySet(overview);
  const deck = set ? decks.get(set.deckId) ?? null : null;

  if (loading) {
    return (
      <Frame onBack={onBack} styles={styles} title={t('review.title')}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame onBack={onBack} styles={styles} title={t('review.title')}>
        {offline && <OfflineBanner />}
        <View style={styles.centered}>
          <Text style={styles.message}>
            {offline ? t('review.offlineLoad') : t('review.loadError')}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={reload} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      </Frame>
    );
  }

  if (!set || !deck) {
    // Three different situations land here and the copy has to tell them apart:
    // nothing is due; something is due but its list was never imported; or the
    // deck row vanished under us.
    const unresolved = overview?.unresolvedCardIds.length ?? 0;
    return (
      <Frame onBack={onBack} styles={styles} title={t('review.title')}>
        <View style={styles.centered}>
          <Text style={styles.doneTitle}>{t('review.nothingDue')}</Text>
          {unresolved > 0 && (
            <Text style={styles.message}>
              {t('review.notImported', { count: unresolved })}
            </Text>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </Frame>
    );
  }

  return <RunningSession set={set} deck={deck} onBack={onBack} onDone={onBack} />;
}

interface RunningSessionProps {
  set: DeckReviewSet;
  deck: Deck;
  onBack: () => void;
  onDone: () => void;
}

/**
 * Split out so the session hook mounts only once a set exists — it keys its
 * phase plan off the word list, and mounting it with an empty set would plan an
 * empty session.
 */
function RunningSession({ set, deck, onBack, onDone }: RunningSessionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { state, tracking, wordIds, advance } = useCourseReviewSession(set);

  // Every exercise reports a correct count we do not use: the rating comes from
  // the accumulated per-answer evidence, not from a phase score.
  const handlePhaseDone = useCallback(() => advance(), [advance]);
  const handlePreviewDone = useCallback(() => advance(), [advance]);

  if (state.stage === 'loading' || state.stage === 'submitting') {
    return (
      <Frame onBack={onBack} styles={styles} title={t('review.title')}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          {state.stage === 'submitting' && (
            <Text style={styles.message}>{t('review.submitting')}</Text>
          )}
        </View>
      </Frame>
    );
  }

  if (state.stage === 'complete') {
    return (
      <Frame onBack={onBack} styles={styles} title={t('review.title')}>
        <ScrollView contentContainerStyle={styles.centered}>
          <SessionSummary
            submitted={state.submitted}
            ungradedCount={state.ungradedCount}
            onDone={onDone}
          />
        </ScrollView>
      </Frame>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {set.deckTitle || t('review.title')}
      </Text>
      <PhaseTracker
        phase={state.phase}
        phaseIndex={state.phaseIndex}
        totalPhases={state.totalPhases}
      />
    </View>
  );

  const body = () => {
    switch (state.phase) {
      case 'preview':
        return (
          <CardScreen
            deck={deck}
            mode="review"
            overrideWords={state.previewWords}
            onBack={onBack}
            onDeepDone={handlePreviewDone}
          />
        );
      case 'listening':
        return (
          <ListeningExercise
            deckId={set.deckId}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={handlePhaseDone}
            onComplete={handlePhaseDone}
            tracking={tracking}
          />
        );
      case 'quiz':
        return (
          <QuizExercise
            deckId={set.deckId}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={handlePhaseDone}
            onComplete={handlePhaseDone}
            tracking={tracking}
          />
        );
      case 'spelling':
        return (
          <SpellingExercise
            deckId={set.deckId}
            overrideWordIds={wordIds}
            onBack={onBack}
            onSessionDone={handlePhaseDone}
            onComplete={handlePhaseDone}
            tracking={tracking}
          />
        );
      default:
        return (
          <View style={styles.centered}>
            <Text style={styles.message}>{t('review.nothingDue')}</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <View style={styles.flex}>{body()}</View>
    </SafeAreaView>
  );
}

interface FrameProps {
  title: string;
  onBack: () => void;
  styles: ReturnType<typeof makeStyles>;
  children: React.ReactNode;
}

function Frame({ title, onBack, styles, children }: FrameProps) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.backButton} />
      </View>
      {children}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    backButton: {
      minWidth: 70,
    },
    backText: {
      fontSize: 16,
      color: colors.accent,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    centered: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    doneTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    primaryButtonText: {
      color: colors.textInverted,
      fontSize: 16,
      fontWeight: '600',
    },
  });
