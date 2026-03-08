import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { HomeScreen } from '../screens/HomeScreen';
import { CardScreen } from '../screens/CardScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MatchingExercise } from '../screens/LearningScreen/exercises/MatchingExercise';
import { Deck } from '../repositories/DeckRepository';
import { useTheme } from '../providers/ThemeProvider';
import { ColorScheme } from '../theme/colors';
import { QuizExercise } from '../screens/LearningScreen/exercises/QuizExercise';

type Tab = 'Home' | 'Settings';

type Screen =
  | { name: 'Home' }
  | { name: 'Card'; deck: Deck }
  | { name: 'Matching'; deckId: number }
  | { name: 'Quiz'; deckId: number }
  | { name: 'Settings' };

export function RootNavigator() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // const [screen, setScreen] = useState<Screen>({ name: 'Home' });
  const [screen, setScreen] = useState<Screen>({
    name: 'Quiz',
    deckId: 1,
  });
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  const navigateTo = useCallback((s: Screen) => setScreen(s), []);

  const navigateBack = useCallback(() => {
    setScreen({ name: 'Home' });
    setActiveTab('Home');
  }, []);

  const handleTabPress = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setScreen(tab === 'Settings' ? { name: 'Settings' } : { name: 'Home' });
  }, []);

  const renderScreen = () => {
    switch (screen.name) {
      case 'Card':
        return <CardScreen deck={screen.deck} onBack={navigateBack} />;

      case 'Matching':
        return (
          <MatchingExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onDone={navigateBack}
          />
        );

      case 'Quiz':
        return (
          <QuizExercise
            deckId={screen.deckId}
            onBack={navigateBack}
            onDone={navigateBack}
          />
        );

      case 'Settings':
        return <SettingsScreen />;

      case 'Home':
      default:
        return (
          <HomeScreen
            onDeckPress={deck => navigateTo({ name: 'Card', deck })}
            onModePress={(mode, deckId) => {
              switch (mode) {
                case 'matching':
                  navigateTo({ name: 'Matching', deckId });
                  break;
                case 'quiz':
                  navigateTo({ name: 'Quiz', deckId });
                  break;
                // quiz, spelling, listening — coming in next commits
                default:
                  navigateTo({ name: 'Card', deck: { id: deckId } as Deck });
              }
            }}
          />
        );
    }
  };

  const showTabBar =
    screen.name !== 'Card' &&
    screen.name !== 'Matching' &&
    screen.name !== 'Quiz';

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
