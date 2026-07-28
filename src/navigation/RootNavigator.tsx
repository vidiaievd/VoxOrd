import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { HomeScreen } from '../screens/HomeScreen';
import { CardScreen } from '../screens/CardScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ModeSelector } from '../screens/LearningScreen/ModeSelector';
import { MatchingExercise } from '../screens/LearningScreen/exercises/MatchingExercise';
import { QuizExercise } from '../screens/LearningScreen/exercises/QuizExercise';
import { SpellingExercise } from '../screens/LearningScreen/exercises/SpellingExercise';
import { ListeningExercise } from '../screens/LearningScreen/exercises/ListeningExercise';
import { Deck } from '../repositories/DeckRepository';
import { useTheme } from '../providers/ThemeProvider';
import { ColorScheme } from '../theme/colors';
import { SessionResultsScreen } from '../screens/LearningScreen/SessionResultsScreen';
import { ContextExercise } from '../screens/LearningScreen/exercises/ContextExercise';
import { DeepSessionScreen } from '../screens/LearningScreen/DeepSessionScreen';
import { PronunciationExercise } from '../screens/LearningScreen/exercises/pronunciation/PronunciationExercise';
import { CoursesScreen } from '../screens/CoursesScreen';
import { CourseHomeScreen } from '../screens/CourseHomeScreen';
import { UnitContentsScreen } from '../screens/UnitContentsScreen';
import { LessonReaderScreen } from '../screens/LessonReaderScreen';
import { ExerciseRunnerScreen } from '../screens/ExerciseRunner';
import { VocabularyListScreen } from '../screens/VocabularyListScreen';
import { ReviewSessionScreen } from '../screens/ReviewSessionScreen';

type Tab = 'Home' | 'Courses' | 'Settings';

type Screen =
  | { name: 'Home' }
  | { name: 'ModeSelector'; deck: Deck }
  | { name: 'Card'; deck: Deck; mode?: 'assessment' }
  | { name: 'Matching'; deckId: number }
  | { name: 'Quiz'; deckId: number }
  | { name: 'Spelling'; deckId: number }
  | { name: 'Listening'; deckId: number }
  | { name: 'Pronunciation'; deckId: number }
  | { name: 'Context'; deckId: number }
  | { name: 'DeepSession'; deck: Deck }
  | { name: 'SessionResults'; sessionId: number; deckId: number }
  | { name: 'Courses' }
  | { name: 'CourseHome'; courseId: string }
  | { name: 'UnitContents'; unitId: string; courseId: string }
  | { name: 'LessonReader'; lessonId: string; unitId: string; courseId: string }
  | { name: 'VocabularyList'; listId: string; unitId: string; courseId: string }
  | { name: 'ReviewSession'; courseId?: string }
  | {
      name: 'ExerciseRunner';
      exerciseIds: string[];
      startIndex: number;
      unitId: string;
      courseId: string;
    }
  | { name: 'Settings' };

const SCREEN_FOR_TAB: Record<Tab, Screen> = {
  Home: { name: 'Home' },
  Courses: { name: 'Courses' },
  Settings: { name: 'Settings' },
};

export function RootNavigator() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [screen, setScreen] = useState<Screen>({ name: 'Home' });
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  const navigateTo = useCallback((s: Screen) => setScreen(s), []);

  const navigateToResults = useCallback(
    (sessionId: number, deckId: number) => {
      navigateTo({ name: 'SessionResults', sessionId, deckId });
    },
    [navigateTo],
  );

  const navigateBack = useCallback(() => {
    setScreen({ name: 'Home' });
    setActiveTab('Home');
  }, []);

  // Navigate back to ModeSelector if we came from there
  const navigateBackToSelector = useCallback((deck: Deck) => {
    setScreen({ name: 'ModeSelector', deck });
  }, []);

  const handleTabPress = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setScreen(SCREEN_FOR_TAB[tab]);
  }, []);

  const handleModeSelect = useCallback(
    (modeId: string, deck: Deck) => {
      switch (modeId) {
        case 'flashcard':
          navigateTo({ name: 'Card', deck });
          break;
        case 'assessment':
          navigateTo({ name: 'Card', deck, mode: 'assessment' });
          break;
        case 'matching':
          navigateTo({ name: 'Matching', deckId: deck.id });
          break;
        case 'quiz':
          navigateTo({ name: 'Quiz', deckId: deck.id });
          break;
        case 'spelling':
          navigateTo({ name: 'Spelling', deckId: deck.id });
          break;
        case 'listening':
          navigateTo({ name: 'Listening', deckId: deck.id });
          break;
        case 'pronunciation':
          navigateTo({ name: 'Pronunciation', deckId: deck.id });
          break;
        case 'context':
          navigateTo({ name: 'Context', deckId: deck.id });
          break;
        case 'deep':
          navigateTo({ name: 'DeepSession', deck });
          break;
        default:
          console.warn('[Nav] unknown mode:', modeId);
      }
    },
    [navigateTo],
  );

  const renderScreen = () => {
    switch (screen.name) {
      case 'ModeSelector':
        return (
          <ModeSelector
            deck={screen.deck}
            onSelectMode={handleModeSelect}
            onBack={navigateBack}
          />
        );

      case 'Card':
        return (
          <CardScreen
            deck={screen.deck}
            mode={screen.mode ?? 'assessment'}
            onBack={() => navigateBackToSelector(screen.deck)}
          />
        );

      case 'Matching':
        return (
          <MatchingExercise
            deckId={screen.deckId}
            onBack={() =>
              setScreen(prev =>
                prev.name === 'Matching' ? { name: 'Home' } : prev,
              )
            }
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'Quiz':
        return (
          <QuizExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'Spelling':
        return (
          <SpellingExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'Listening':
        return (
          <ListeningExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'Pronunciation':
        return (
          <PronunciationExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'Context':
        return (
          <ContextExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deckId)}
          />
        );

      case 'DeepSession':
        return (
          <DeepSessionScreen
            deck={screen.deck}
            onBack={navigateBack}
            onSessionDone={sid => navigateToResults(sid, screen.deck.id)}
          />
        );

      case 'SessionResults':
        return (
          <SessionResultsScreen
            sessionId={screen.sessionId}
            onContinue={navigateBack}
            onRepeat={() => {
              // Go back to ModeSelector for the same deck
              // We need a minimal deck — ModeSelector will show full info
              navigateTo({
                name: 'ModeSelector',
                deck: { id: screen.deckId } as Deck,
              });
            }}
          />
        );

      case 'Courses':
        return (
          <CoursesScreen
            onCoursePress={courseId => navigateTo({ name: 'CourseHome', courseId })}
          />
        );

      case 'CourseHome':
        return (
          <CourseHomeScreen
            courseId={screen.courseId}
            onBack={() => setScreen({ name: 'Courses' })}
            onUnitPress={unitId =>
              navigateTo({ name: 'UnitContents', unitId, courseId: screen.courseId })
            }
            onReviewPress={() =>
              navigateTo({ name: 'ReviewSession', courseId: screen.courseId })
            }
          />
        );

      case 'UnitContents':
        return (
          <UnitContentsScreen
            unitId={screen.unitId}
            onBack={() => setScreen({ name: 'CourseHome', courseId: screen.courseId })}
            onLessonPress={lessonId =>
              navigateTo({
                name: 'LessonReader',
                lessonId,
                unitId: screen.unitId,
                courseId: screen.courseId,
              })
            }
            onExercisePress={(exerciseIds, startIndex) =>
              navigateTo({
                name: 'ExerciseRunner',
                exerciseIds,
                startIndex,
                unitId: screen.unitId,
                courseId: screen.courseId,
              })
            }
            onVocabularyPress={listId =>
              navigateTo({
                name: 'VocabularyList',
                listId,
                unitId: screen.unitId,
                courseId: screen.courseId,
              })
            }
          />
        );

      case 'ExerciseRunner': {
        const backToUnit = () =>
          setScreen({
            name: 'UnitContents',
            unitId: screen.unitId,
            courseId: screen.courseId,
          });
        return (
          <ExerciseRunnerScreen
            exerciseIds={screen.exerciseIds}
            startIndex={screen.startIndex}
            onBack={backToUnit}
            onComplete={backToUnit}
          />
        );
      }

      case 'ReviewSession':
        return (
          <ReviewSessionScreen
            onBack={() =>
              setScreen(
                screen.courseId
                  ? { name: 'CourseHome', courseId: screen.courseId }
                  : { name: 'Home' },
              )
            }
          />
        );

      case 'VocabularyList':
        return (
          <VocabularyListScreen
            listId={screen.listId}
            onBack={() =>
              setScreen({ name: 'UnitContents', unitId: screen.unitId, courseId: screen.courseId })
            }
          />
        );

      case 'LessonReader':
        return (
          <LessonReaderScreen
            lessonId={screen.lessonId}
            courseId={screen.courseId}
            onBack={() =>
              setScreen({ name: 'UnitContents', unitId: screen.unitId, courseId: screen.courseId })
            }
          />
        );

      case 'Settings':
        return <SettingsScreen />;

      case 'Home':
      default:
        return (
          <HomeScreen
            onDeckPress={deck => navigateTo({ name: 'ModeSelector', deck })}
            onModePress={(modeId, deckId) => {
              // From DailyTraining grid — need a minimal Deck object
              // Full deck will be loaded in ModeSelector
              navigateTo({
                name: 'ModeSelector',
                deck: { id: deckId } as Deck,
              });
            }}
            onStartCourseReview={() => navigateTo({ name: 'ReviewSession' })}
          />
        );
    }
  };

  const showTabBar =
    screen.name !== 'Card' &&
    screen.name !== 'ModeSelector' &&
    screen.name !== 'Matching' &&
    screen.name !== 'Quiz' &&
    screen.name !== 'Spelling' &&
    screen.name !== 'SessionResults' &&
    screen.name !== 'DeepSession' &&
    screen.name !== 'Pronunciation' &&
    screen.name !== 'Listening' &&
    screen.name !== 'CourseHome' &&
    screen.name !== 'UnitContents' &&
    screen.name !== 'LessonReader' &&
    screen.name !== 'VocabularyList' &&
    screen.name !== 'ReviewSession' &&
    screen.name !== 'ExerciseRunner';

  return (
    <View style={styles.root}>
      <View style={styles.content}>{renderScreen()}</View>
      {showTabBar && (
        <SafeAreaView edges={['bottom']} style={styles.tabBar}>
          <TabItem
            icon="🏠"
            label={t('nav.home')}
            isActive={activeTab === 'Home'}
            onPress={() => handleTabPress('Home')}
            colors={colors}
          />
          <TabItem
            icon="🎓"
            label={t('nav.courses')}
            isActive={activeTab === 'Courses'}
            onPress={() => handleTabPress('Courses')}
            colors={colors}
          />
          <TabItem
            icon="⚙️"
            label={t('nav.settings')}
            isActive={activeTab === 'Settings'}
            onPress={() => handleTabPress('Settings')}
            colors={colors}
          />
        </SafeAreaView>
      )}
    </View>
  );
}

function TabItem({
  icon,
  label,
  isActive,
  onPress,
  colors,
}: {
  icon: string;
  label: string;
  isActive: boolean;
  onPress: () => void;
  colors: ColorScheme;
}) {
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity
      style={styles.tabItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
        {label}
      </Text>
      {isActive && <View style={styles.tabIndicator} />}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.tabBar,
      borderTopWidth: 1,
      borderTopColor: colors.tabBarBorder,
      paddingTop: 8,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingBottom: 4,
      position: 'relative',
    },
    tabIcon: {
      fontSize: 22,
    },
    tabLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      fontWeight: '500',
    },
    tabLabelActive: {
      color: colors.accent,
    },
    tabIndicator: {
      position: 'absolute',
      top: 0,
      width: 24,
      height: 3,
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
  });
