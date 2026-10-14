import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  BackHandler,
  ToastAndroid,
} from 'react-native';
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
import { GrammarRuleReaderScreen } from '../screens/GrammarRuleReaderScreen';
import { ReviewSessionScreen } from '../screens/ReviewSessionScreen';
import { MyWordsScreen } from '../screens/MyWordsScreen';
import { backTarget, tabOf, type Screen, type Tab } from './screens';
import { BackInterceptProvider } from './backIntercept';
import { AuthScreen } from '../screens/AuthScreen';
import { useAuth } from '../hooks/useAuth';
import { setLastCourseId } from '../store/lastCourseStore';

/** How long a second Back on Home has to follow the first to leave the app. */
const EXIT_WINDOW_MS = 2000;

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
  const { status: authStatus } = useAuth();

  // Signed out — by the Settings button or by a session the server dropped — the next
  // sign-in starts from Home, not from wherever the last one left off.
  useEffect(() => {
    if (authStatus !== 'signedOut') return;
    setScreen({ name: 'Home' });
    setActiveTab('Home');
  }, [authStatus]);

  const navigateTo = useCallback((s: Screen) => setScreen(s), []);

  /** Go to `target` with the tab bar following it — what Back does everywhere. */
  const goTo = useCallback((target: Screen) => {
    setScreen(target);
    const tab = tabOf(target);
    if (tab !== null) setActiveTab(tab);
  }, []);

  /** The current screen's way back, for its own arrow. */
  const goBack = useCallback(() => {
    const target = backTarget(screen);
    if (target !== null) goTo(target);
  }, [goTo, screen]);

  /** A screen's own handler for Back, if it registered one — see `useBackIntercept`. */
  const interceptRef = useRef<(() => boolean) | null>(null);
  const lastHomeBack = useRef(0);

  /*
    The phone's Back button. Without this every press left the app, wherever it was pressed.
    A screen with work in progress is asked first; otherwise Back goes where the screen's own
    arrow goes. On Home it takes two presses to leave, with a toast between them. An open
    sheet never gets here: React Native's Modal takes Back itself and closes.
  */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (interceptRef.current?.()) return true;

      const target = backTarget(screen);
      if (target !== null) {
        goTo(target);
        return true;
      }

      const now = Date.now();
      if (now - lastHomeBack.current < EXIT_WINDOW_MS) return false;
      lastHomeBack.current = now;
      ToastAndroid.show(t('nav.pressAgainToExit'), ToastAndroid.SHORT);
      return true;
    });
    return () => sub.remove();
  }, [goTo, screen, t]);

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

  /** Open a course, and remember it as the one Home's «Continue» picks up. */
  const openCourse = useCallback(
    (courseId: string) => {
      setLastCourseId(courseId);
      goTo({ name: 'CourseHome', courseId });
    },
    [goTo],
  );

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
          <CoursesScreen onCoursePress={openCourse} />
        );

      case 'CourseHome':
        return (
          <CourseHomeScreen
            courseId={screen.courseId}
            onBack={goBack}
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
            onBack={goBack}
            onLessonPress={(lessonId, exerciseIds, alreadyRead) =>
              navigateTo({
                name: 'LessonReader',
                lessonId,
                unitId: screen.unitId,
                courseId: screen.courseId,
                exerciseIds,
                alreadyRead,
              })
            }
            onExercisePress={(exerciseIds, startIndex, sourceLessonId) =>
              navigateTo({
                name: 'ExerciseRunner',
                exerciseIds,
                startIndex,
                unitId: screen.unitId,
                courseId: screen.courseId,
                ...(sourceLessonId === null ? {} : { sourceLessonId }),
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
            onGrammarRulePress={ruleId =>
              navigateTo({
                name: 'GrammarRuleReader',
                ruleId,
                unitId: screen.unitId,
                courseId: screen.courseId,
              })
            }
          />
        );

      case 'ExerciseRunner': {
        const backToUnit = goBack;
        // The text these exercises are about, when the unit has one. This navigator holds
        // one screen and no stack, so opening the lesson leaves the runner exactly as
        // tapping Back would — and the way back from the lesson is the unit, which is
        // also the way back from the runner (plan 54 phase 7).
        const sourceLessonId = screen.sourceLessonId;
        const openSourceLesson =
          sourceLessonId === undefined
            ? undefined
            : () =>
                navigateTo({
                  name: 'LessonReader',
                  lessonId: sourceLessonId,
                  unitId: screen.unitId,
                  courseId: screen.courseId,
                });
        return (
          <ExerciseRunnerScreen
            exerciseIds={screen.exerciseIds}
            startIndex={screen.startIndex}
            onBack={backToUnit}
            onComplete={backToUnit}
            onOpenSourceLesson={openSourceLesson}
          />
        );
      }

      case 'ReviewSession':
        return (
          <ReviewSessionScreen onBack={goBack} />
        );

      case 'MyWords':
        return <MyWordsScreen onBack={goBack} />;

      case 'VocabularyList':
        return (
          <VocabularyListScreen
            listId={screen.listId}
            onBack={goBack}
          />
        );

      case 'LessonReader': {
        // The text's exercises, as its unit worked them out. None — a text opened from the
        // runner's «To the text», or one with nothing after it — and the reader just closes.
        const lessonId = screen.lessonId;
        const practiceIds = screen.exerciseIds ?? [];
        return (
          <LessonReaderScreen
            lessonId={lessonId}
            courseId={screen.courseId}
            onBack={goBack}
            alreadyRead={screen.alreadyRead === true}
            onPractice={
              practiceIds.length === 0
                ? undefined
                : () =>
                    navigateTo({
                      name: 'ExerciseRunner',
                      exerciseIds: practiceIds,
                      startIndex: 0,
                      unitId: screen.unitId,
                      courseId: screen.courseId,
                      sourceLessonId: lessonId,
                    })
            }
          />
        );
      }

      case 'GrammarRuleReader':
        return (
          <GrammarRuleReaderScreen
            ruleId={screen.ruleId}
            courseId={screen.courseId}
            onBack={goBack}
            onPracticePress={exerciseIds =>
              navigateTo({
                name: 'ExerciseRunner',
                exerciseIds,
                startIndex: 0,
                unitId: screen.unitId,
                courseId: screen.courseId,
              })
            }
          />
        );

      case 'Settings':
        return <SettingsScreen />;

      case 'Home':
      default:
        return (
          <HomeScreen
            onOpenCourse={openCourse}
            onOpenUnit={(unitId, courseId) => {
              setLastCourseId(courseId);
              goTo({ name: 'UnitContents', unitId, courseId });
            }}
            onStartReview={() => navigateTo({ name: 'ReviewSession' })}
            onAllCourses={() => handleTabPress('Courses')}
            onOpenMyWords={() => navigateTo({ name: 'MyWords' })}
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
    screen.name !== 'GrammarRuleReader' &&
    screen.name !== 'ReviewSession' &&
    screen.name !== 'ExerciseRunner';

  // Every screen past this point is the learner's own; without a session there is only
  // the way in.
  if (authStatus !== 'signedIn') return <AuthScreen />;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <BackInterceptProvider handlerRef={interceptRef}>{renderScreen()}</BackInterceptProvider>
      </View>
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
