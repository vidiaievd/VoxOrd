import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedIfEmpty } from './src/db/seed';
import { settingsStore } from './src/store/settingsStore';
import { debugPrintAllWords } from './src/db/words';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getDatabase();
        await runMigrations(db);
        await seedIfEmpty(db);
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
