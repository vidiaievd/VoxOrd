import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageSection } from './sections/LanguageSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LearningSection } from './sections/LearningSection';
import { StatisticsSection } from './sections/StatisticsSection';
import { SettingsSection } from './components/SettingsSection';
import { SettingsRow } from './components/SettingsRow';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';

export function SettingsScreen() {
  const { t } = useTranslation();

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <StatisticsSection />
        <LanguageSection />
        <AppearanceSection />
        <LearningSection />

        <SettingsSection title={t('settings.about')}>
          <SettingsRow
            type="navigate"
            icon="ℹ️"
            label={t('settings.version')}
            badge="1.0.0"
            onPress={() => {}}
          />
          <SettingsRow
            type="navigate"
            icon="💬"
            label={t('settings.feedback')}
            onPress={() => {}}
            isLast
          />
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    scroll: {
      paddingBottom: 32,
    },
  });
