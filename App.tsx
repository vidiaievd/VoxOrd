import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedIfEmpty } from './src/db/seed';
import { settingsStore } from './src/store/settingsStore';
import { debugPrintAllWords } from './src/db/words';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { sessionRepository } from './src/repositories/SessionRepository';
import { SessionEngine } from './src/learning-engine/SessionEngine';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getDatabase();
        await runMigrations(db);
        await seedIfEmpty(db);

        //TODO remove after testing
        const sessionId = await sessionRepository.create('quick', 1);
        console.log('[Test] Session created:', sessionId);

        await sessionRepository.recordResult({
          sessionId,
          wordId: 1,
          exerciseType: 'flashcard',
          isCorrect: true,
          responseTimeMs: 1200,
        });

        await sessionRepository.recordResult({
          sessionId,
          wordId: 2,
          exerciseType: 'flashcard',
          isCorrect: false,
          responseTimeMs: 3400,
        });

        const xp = await sessionRepository.finish(sessionId, {
          totalWords: 2,
          correctAnswers: 1,
          sessionType: 'quick',
        });
        console.log('[Test] XP earned:', xp);

        const summary = await sessionRepository.getSummary(sessionId);
        console.log('[Test] Accuracy:', summary?.accuracy.toFixed(2));
        console.log('[Test] By exercise:', JSON.stringify(summary?.byExercise));

        const xpFull = SessionEngine.calculateXP({
          correctAnswers: 10,
          totalAnswers: 10,
          sessionType: 'standard',
        });
        console.log('[Test] Perfect session XP:', xpFull);
        //TODO end of testing

        await settingsStore.load();
        await debugPrintAllWords();
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: 'red', padding: 16 },
});
