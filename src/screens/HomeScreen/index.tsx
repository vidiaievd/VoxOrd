import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorScheme } from '../../theme/colors';
import { HomeHeader }           from './components/HomeHeader';
import { ContinueLearningCard } from './components/ContinueLearningCard';
import { DailyTrainingSection } from './components/DailyTrainingSection';
import { ProgressSection }      from './components/ProgressSection';
import { TopicsSection }        from './components/TopicsSection';
import { AIPracticeCard }       from './components/AIPracticeCard';
import {
  DUMMY_USER,
  DUMMY_CONTINUE,
  DUMMY_TRAINING_MODES,
  DUMMY_STATS,
  DUMMY_TOPICS,
} from './data';
import { TrainingMode, Topic } from './types';
import { useTheme } from '../../providers/ThemeProvider';

interface HomeScreenProps {
  onDeckPress: (deckId: number) => void;
}

export function HomeScreen({ onDeckPress }: HomeScreenProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);

  const handleTrainingMode = (mode: TrainingMode) => {
    console.log('Training mode:', mode.id);
  };

  const handleTopic = (topic: Topic) => {
    console.log('Topic pressed:', topic.id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <HomeHeader
          name={DUMMY_USER.name}
          avatar={DUMMY_USER.avatar}
          streak={DUMMY_USER.streak}
          xp={DUMMY_USER.xp}
          onAvatarPress={() => {}}
        />

        <ContinueLearningCard
          deckTitle={DUMMY_CONTINUE.deckTitle}
          deckIcon={DUMMY_CONTINUE.deckIcon}
          progress={DUMMY_CONTINUE.progress}
          wordsLeft={DUMMY_CONTINUE.wordsLeft}
          totalWords={DUMMY_CONTINUE.totalWords}
          ctaLabel="Start learning"
          onPress={() => onDeckPress(1)}
        />

        <DailyTrainingSection
          title="Daglig trening"
          modes={DUMMY_TRAINING_MODES}
          onPress={handleTrainingMode}
        />

        <ProgressSection
          title="Din fremgang"
          wordsLearned={DUMMY_STATS.wordsLearned}
          dailyDone={DUMMY_USER.dailyDone}
          dailyGoal={DUMMY_USER.dailyGoal}
          weekActivity={DUMMY_STATS.weekActivity}
        />

        <TopicsSection
          title="Emner"
          topics={DUMMY_TOPICS}
          onPress={handleTopic}
        />

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
  scroll: {
    paddingBottom: 16,
  },
  bottomPadding: {
    height: 16,
  },
});