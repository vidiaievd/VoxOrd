import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import {
  GlobalStats,
  statsRepository,
} from '../../../repositories/StatsRepository';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';

export function StatisticsSection() {
  const { t } = useTranslation();

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [stats, setStats] = useState<GlobalStats>({
    totalWords: 0,
    learnedWords: 0,
    repeatWords: 0,
    totalDecks: 0,
  });

  useEffect(() => {
    statsRepository.getGlobalStats().then(setStats);
  }, []);

  const progress =
    stats.totalWords > 0
      ? Math.round((stats.learnedWords / stats.totalWords) * 100)
      : 0;

  return (
    <SettingsSection title={t('settings.statistics')}>
      <View style={styles.grid}>
        <StatCard
          value={stats.totalDecks}
          label={t('stats.decks')}
          color="#6c63ff"
        />
        <StatCard
          value={stats.totalWords}
          label={t('stats.words')}
          color="#1a1a2e"
        />
        <StatCard
          value={stats.learnedWords}
          label={t('stats.learned')}
          color="#34c759"
        />
        <StatCard
          value={`${progress}%`}
          label={t('stats.progress')}
          color="#ff9f43"
        />
      </View>
    </SettingsSection>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 12,
    },
    card: {
      width: '47%',
      margin: '1.5%',
      backgroundColor: colors.backgroundInput,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    value: {
      fontSize: 24,
      fontWeight: '800',
    },
    label: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
    },
  });
