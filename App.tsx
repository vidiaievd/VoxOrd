import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedIfEmpty } from './src/db/seed';
import { settingsStore } from './src/store/settingsStore';
import { apiSettingsStore } from './src/store/apiSettingsStore';
import { authService } from './src/api/auth';
import { debugPrintAllWords } from './src/db/words';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { wordExampleRepository } from './src/repositories/WordExampleRepository';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getDatabase();
        await runMigrations(db);
        await seedIfEmpty(db);

        //TODO: testing block, remove later
        const examples = await wordExampleRepository.getForWord(1, 'ru');
        console.log('[Test] ru:', examples[0]?.translation);

        const examplesUk = await wordExampleRepository.getForWord(1, 'uk');
        console.log('[Test] uk:', examplesUk[0]?.translation);

        const examplesEn = await wordExampleRepository.getForWord(1, 'en');
        console.log('[Test] en:', examplesEn[0]?.translation);

        const translations = await wordExampleRepository.getTranslations(1);
        console.log('[Test] all translations:', translations.length);
        //TODO: end of testing block, remove later
        await settingsStore.load();
        await apiSettingsStore.load();
        await debugPrintAllWords();

        // Platform session restore is deliberately NOT awaited: it performs a
        // network call, and word learning is offline-first — a slow or
        // unreachable backend must never delay app start. Course screens read
        // authStore and render their own 'restoring' state until it settles.
        authService.install();
        void authService.restore();

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
