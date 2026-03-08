import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme }             from '../../providers/ThemeProvider';
import { ColorScheme }          from '../../theme/colors';
import { HomeHeader }           from './components/HomeHeader';
import { ContinueLearningCard } from './components/ContinueLearningCard';
import { DailyTrainingSection } from './components/DailyTrainingSection';
import { ProgressSection }      from './components/ProgressSection';
import { TopicsSection }        from './components/TopicsSection';
import { AIPracticeCard }       from './components/AIPracticeCard';
import { useHomeData }          from '../../hooks/useHomeData';
import { TrainingMode, Topic }  from './types';

const TRAINING_MODES: TrainingMode[] = [
  { id: 'flashcard', icon: '🃏', labelKey: 'Flashcards', color: '#6c63ff' },
  { id: 'listening', icon: '🎧', labelKey: 'Listening',  color: '#ff9f43' },
  { id: 'spelling',  icon: '✍️', labelKey: 'Spelling',   color: '#34c759' },
  { id: 'quiz',      icon: '⚡', labelKey: 'Quick Quiz', color: '#ff3b30' },
];

export function HomeScreen() {
  const { colors }              = useTheme();
  const styles                  = makeStyles(colors);
  const { data, isLoading, refresh } = useHomeData();

  const handleTrainingMode = useCallback((mode: TrainingMode) => {
    console.log('[Home] Training mode:', mode.id);
    // TODO: Learning system navigation
  }, []);

  const handleTopic = useCallback((topic: Topic) => {
    console.log('[Home] Topic pressed:', topic.id);
    // TODO: Navigation for deck by topic.id
  }, []);

  const handleContinue = useCallback(() => {
    if (!data?.continueLearning) return;
    // find deck by id and pass it up
    // TODO: pass full Deck object when connecting real navigation
    console.log('[Home] Continue deck:', data.continueLearning.deckId);
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // TopicsSection
  const topics: Topic[] = data?.continueLearning
    ? [{
        id:       data.continueLearning.deckId,
        title:    data.continueLearning.deckTitle,
        icon:     data.continueLearning.deckIcon,
        words:    data.continueLearning.totalWords,
        progress: data.continueLearning.progress,
      }]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
      >
        <HomeHeader
          name={data?.profile.name   ?? 'User'}
          avatar={data?.profile.avatar ?? '👤'}
          streak={data?.stats.streak   ?? 0}
          xp={data?.stats.xp           ?? 0}
          onAvatarPress={() => {}}
        />

        {data?.continueLearning && (
          <ContinueLearningCard
            deckTitle={data.continueLearning.deckTitle}
            deckIcon={data.continueLearning.deckIcon}
            progress={data.continueLearning.progress}
            wordsLeft={data.continueLearning.wordsLeft}
            totalWords={data.continueLearning.totalWords}
            ctaLabel="Start learning"
            onPress={handleContinue}
          />
        )}

        <DailyTrainingSection
          title="Daglig trening"
          modes={TRAINING_MODES}
          onPress={handleTrainingMode}
        />

        <ProgressSection
          title="Din fremgang"
          wordsLearned={data?.globalStats.learnedWords ?? 0}
          dailyDone={data?.dailyProgress.done          ?? 0}
          dailyGoal={data?.dailyProgress.goal          ?? 20}
          weekActivity={data?.weekActivity             ?? Array(7).fill(0)}
        />

        {topics.length > 0 && (
          <TopicsSection
            title="Emner"
            topics={topics}
            onPress={handleTopic}
          />
        )}

        <AIPracticeCard
          title="AI Practice"
          subtitle="Øv ord i samtale"
          ctaLabel="Start"
          onPress={() => {}}
        />

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
  },
  loader: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: 16,
  },
  bottomPadding: {
    height: 16,
  },
});