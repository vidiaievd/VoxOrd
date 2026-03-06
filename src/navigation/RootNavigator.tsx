import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreen } from '../screens/HomeScreen';
import { CardScreen } from '../screens/CardScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { Deck } from '../repositories/DeckRepository';

type Tab = 'Home' | 'Settings';
type Screen =
  | { name: 'Home' }
  | { name: 'Card'; deck: Deck }
  | { name: 'Settings' };

export function RootNavigator() {
  const [screen, setScreen] = useState<Screen>({ name: 'Home' });
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  const navigateTo = (s: Screen) => setScreen(s);

  const handleTabPress = (tab: Tab) => {
  setActiveTab(tab);
  if (tab === 'Settings') {
    setScreen({ name: 'Settings' });
  } else {
    setScreen({ name: 'Home' });
  }
};

  const renderScreen = () => {
    switch (screen.name) {
      case 'Card':
        return (
          <CardScreen
            deck={screen.deck}
            onBack={() => {
              setScreen({ name: 'Home' });
              setActiveTab('Home');
            }}
          />
        );
      case 'Settings':
        return <SettingsScreen />;
      case 'Home':
      default:
        return (
          <HomeScreen
            onDeckPress={deck => navigateTo({ name: 'Card', deck })}
          />
        );
    }
  };

  // Hide tab bar on Card screen for more focus
  const showTabBar = screen.name !== 'Card';

  return (
    <View style={styles.root}>
      <View style={styles.content}>{renderScreen()}</View>

      {showTabBar && (
        <SafeAreaView edges={['bottom']} style={styles.tabBar}>
          <TabItem
            icon="🏠"
            label="Главная"
            isActive={activeTab === 'Home'}
            onPress={() => handleTabPress('Home')}
          />
          <TabItem
            icon="⚙️"
            label="Настройки"
            isActive={activeTab === 'Settings'}
            onPress={() => handleTabPress('Settings')}
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
}: {
  icon: string;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f7',
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
    color: '#aaa',
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#6c63ff',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
    backgroundColor: '#6c63ff',
    borderRadius: 2,
  },
});
