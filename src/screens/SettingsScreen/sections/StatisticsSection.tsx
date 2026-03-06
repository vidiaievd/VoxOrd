import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SettingsSection } from '../components/SettingsSection';
import { getDatabase } from '../../../db/database';

interface Stats {
  totalWords: number;
  learnedWords: number;
  repeatWords: number;
  totalDecks: number;
}

export function StatisticsSection() {
  const [stats, setStats] = useState<Stats>({
    totalWords: 0,
    learnedWords: 0,
    repeatWords: 0,
    totalDecks: 0,
  });

  useEffect(() => {
    (async () => {
      const db = getDatabase();

      const wordsResult = await db.execute(`
        SELECT
          COUNT(*)                                                AS total,
          SUM(CASE WHEN status = 'learned' THEN 1 ELSE 0 END)    AS learned,
          SUM(CASE WHEN status = 'repeat'  THEN 1 ELSE 0 END)    AS repeat
        FROM word_progress;
      `);

      const decksResult = await db.execute(
        `SELECT COUNT(*) AS total FROM decks;`,
      );

      const row = wordsResult.rows?.[0];
      setStats({
        totalWords: (row?.total as number) ?? 0,
        learnedWords: (row?.learned as number) ?? 0,
        repeatWords: (row?.repeat as number) ?? 0,
        totalDecks: (decksResult.rows?.[0]?.total as number) ?? 0,
      });
    })();
  }, []);

  const progress =
    stats.totalWords > 0
      ? Math.round((stats.learnedWords / stats.totalWords) * 100)
      : 0;

  return (
    <SettingsSection title="Статистика">
      <View style={styles.grid}>
        <StatCard value={stats.totalDecks} label="Наборов" color="#6c63ff" />
        <StatCard value={stats.totalWords} label="Слов" color="#1a1a2e" />
        <StatCard value={stats.learnedWords} label="Изучено" color="#34c759" />
        <StatCard value={`${progress}%`} label="Прогресс" color="#ff9f43" />
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
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  card: {
    width: '47%',
    backgroundColor: '#f8f8ff',
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
    color: '#888',
    marginTop: 4,
  },
});
