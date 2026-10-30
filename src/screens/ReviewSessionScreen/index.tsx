import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { useBackIntercept } from '../../navigation/backIntercept';
import { radii } from '../../theme/spacing';
import {
  primarySet,
  useCourseReviewSets,
} from '../../hooks/useCourseReviewSets';
import { useCourseReviewSession } from '../../hooks/useCourseReviewSession';
import type { DeckReviewSet } from '../../lib/courseReviewLoader';
import type { Deck } from '../../repositories/DeckRepository';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Skeleton, Spinner } from '../../components/ui';
import { PhaseTracker, SessionHeader } from '../../components/practice';
import { PreviewPhase } from '../../components/practice/PreviewPhase';
import { ListeningPhase, QuizPhase } from '../../components/practice/ChoicePhase';
import { SpellingPhase } from '../../components/practice/SpellingPhase';
import { QuotaGate } from './QuotaGate';
import { NothingDue } from './NothingDue';
import { SessionSummary } from './SessionSummary';

interface ReviewSessionScreenProps {
  onBack: () => void;
}

/**
 * Course-word review session (Practice §7, 6b–6f, 6j).
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
  const { colors, typography } = useTheme();
  const { loading, error, offline, overview, decks, reload } = useCourseReviewSets();
  const [carryOnPastLimit, setCarryOnPastLimit] = useState(false);

  const set = primarySet(overview);
  const deck = set ? decks.get(set.deckId) ?? null : null;

  const frame = (children: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <SessionHeader
        title={t('review.title')}
        leading="back"
        leadingLabel={t('common.back')}
        onLeading={onBack}
      />
      {children}
    </SafeAreaView>
  );

  if (loading) {
    return frame(<CardSkeleton />);
  }

  if (error) {
    return frame(
      <>
        {offline && <OfflineBanner />}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 }}>
          <Text style={[typography.body, { color: colors.neutral400 }]}>
            {offline ? t('review.offlineLoad') : t('review.loadError')}
          </Text>
          <Button variant="secondary" label={t('courses.retry')} onPress={reload} />
        </View>
      </>,
    );
  }

  if (!set || !deck) {
    // Nothing is due, or what is due sits in a list that was never imported, or
    // the deck row vanished under us. «Nothing due» from the phone's copy is as
    // of its last refresh, hence the banner.
    return frame(
      <>
        {overview?.fromReplica && <OfflineBanner />}
        <NothingDue overview={overview} onImported={reload} onBack={onBack} />
      </>,
    );
  }

  const quotaMet =
    !!overview && overview.dailyLimit > 0 && overview.reviewedToday >= overview.dailyLimit;

  if (quotaMet && !carryOnPastLimit) {
    return frame(
      <QuotaGate
        reviewedToday={overview.reviewedToday}
        dailyLimit={overview.dailyLimit}
        totalDue={overview.totalDue}
        onFinish={onBack}
        onCarryOn={() => setCarryOnPastLimit(true)}
      />,
    );
  }

  return (
    <RunningSession
      set={set}
      deck={deck}
      carryOnPastLimit={carryOnPastLimit}
      fromReplica={!!overview?.fromReplica}
      onBack={onBack}
    />
  );
}

interface RunningSessionProps {
  set: DeckReviewSet;
  deck: Deck;
  /** The learner chose to keep going past today's quota; rides on every rating. */
  carryOnPastLimit: boolean;
  fromReplica: boolean;
  onBack: () => void;
}

/**
 * Split out so the session hook mounts only once a set exists — it keys its
 * phase plan off the word list, and mounting it with an empty set would plan an
 * empty session.
 */
function RunningSession({
  set,
  deck,
  carryOnPastLimit,
  fromReplica,
  onBack,
}: RunningSessionProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { show } = useModal();
  const { state, tracking, wordIds, advance, finishEarly } = useCourseReviewSession(set, {
    carryOnPastLimit,
  });
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  // Set when the learner leaves mid-session: once what was collected is posted, go back
  // instead of showing the summary.
  const leavingRef = useRef(false);

  useEffect(() => setProgress(null), [state.phaseIndex]);
  const handleProgress = useCallback(
    (index: number, total: number) => setProgress({ index, total }),
    [],
  );

  useEffect(() => {
    if (state.stage === 'complete' && leavingRef.current) onBack();
  }, [state.stage, onBack]);

  /*
    Leaving mid-session (the X and the phone's Back alike, Practice §12): before the first
    answer there is nothing to lose, so it just leaves. After one, it asks — and on yes posts
    what was collected exactly as finishing does, then goes back. Ratings that cannot reach the
    server wait in the queue as usual.
  */
  const leave = useCallback(() => {
    if (!state.hasAnswers) {
      onBack();
      return;
    }
    show({
      type: 'confirm',
      title: t('reviewSession.exitTitle'),
      message: t('reviewSession.exitBody'),
      confirmLabel: t('reviewSession.exitConfirm'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        leavingRef.current = true;
        finishEarly();
      },
    });
  }, [state.hasAnswers, onBack, show, t, finishEarly]);

  useBackIntercept(() => {
    if (state.stage === 'running') {
      leave();
      return true;
    }
    // Posting: stay until it is done. Loading or the summary: Back goes back as usual.
    return state.stage === 'submitting';
  });

  const frame = (children: React.ReactNode, opts: { close?: () => void; counter?: string } = {}) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <SessionHeader
        title={set.deckTitle || t('review.title')}
        leadingLabel={t('common.close')}
        onLeading={opts.close ?? leave}
        counter={opts.counter}
      />
      {children}
    </SafeAreaView>
  );

  if (state.stage === 'loading') {
    return frame(<CardSkeleton />);
  }

  if (state.stage === 'submitting') {
    return frame(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Spinner size={28} color={colors.accentBase} />
        <Text style={{ fontSize: 15, color: colors.neutral400 }}>{t('review.submitting')}</Text>
      </View>,
      { close: () => undefined },
    );
  }

  if (state.stage === 'complete') {
    if (leavingRef.current) return null;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <SessionHeader
          title={t('review.title')}
          leadingLabel={t('common.close')}
          onLeading={onBack}
        />
        <SessionSummary
          submitted={state.submitted}
          ungradedCount={state.ungradedCount}
          byPhase={state.byPhase}
          elapsedMs={state.elapsedMs}
          onDone={onBack}
        />
      </SafeAreaView>
    );
  }

  const phaseProps = {
    deckId: set.deckId,
    languageCode: deck.languageCode,
    wordIds,
    tracking,
    onDone: advance,
    onProgress: handleProgress,
  };

  const body = () => {
    switch (state.phase) {
      case 'preview':
        return (
          <PreviewPhase
            deckId={set.deckId}
            languageCode={deck.languageCode}
            words={state.previewWords}
            onDone={advance}
            onProgress={handleProgress}
          />
        );
      case 'listening':
        return <ListeningPhase {...phaseProps} />;
      case 'quiz':
        return <QuizPhase {...phaseProps} />;
      case 'spelling':
        return <SpellingPhase {...phaseProps} />;
      default:
        return (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
            <Text style={[typography.body, { color: colors.neutral400 }]}>
              {t('review.nothingDue')}
            </Text>
          </View>
        );
    }
  };

  return frame(
    <>
      {fromReplica && <OfflineBanner />}
      <PhaseTracker phases={state.phases} index={state.phaseIndex} />
      {/* Keyed per phase: each phase hook loads its own questions on mount. */}
      <View key={state.phaseIndex} style={{ flex: 1 }}>
        {body()}
      </View>
    </>,
    { counter: progress ? `${progress.index}/${progress.total}` : undefined },
  );
}

/** Loading: the session's frame with a pulsing 400 card where the word will be (§7.7). */
function CardSkeleton() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
      <Skeleton height={400} radius={radii.card} />
    </View>
  );
}
