import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedAppRows } from './src/db/seed';
import { settingsStore } from './src/store/settingsStore';
import { watchDeviceLocales } from './src/i18n/deviceLocales';
import { apiSettingsStore } from './src/store/apiSettingsStore';
import { authService } from './src/api/auth';
import { sessionSync } from './src/services/sessionSync';
import { installLocalAttempts } from './src/offline/engine';
import { biometricStore } from './src/store/biometricStore';
import { assistantThreadStore } from './src/store/assistantThreadStore';
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
        await seedAppRows(db);

        await settingsStore.load();
        // «As on the phone» follows a language changed in the phone's settings meanwhile.
        watchDeviceLocales();
        await apiSettingsStore.load();

        // Platform session restore is deliberately NOT awaited: it performs a
        // network call, and word learning is offline-first — a slow or
        // unreachable backend must never delay app start. Course screens read
        // authStore and render their own 'restoring' state until it settles.
        // Read before the session is: whether it is stored behind the fingerprint decides how
        // the next refresh is written.
        await biometricStore.load();
        authService.install();
        // Exercises answered without the server go to the phone's copy of the engine.
        installLocalAttempts();
        void authService.restore();
        // A session that worked offline goes back to the server with the network, and what
        // was answered meanwhile goes with it.
        sessionSync.start();
        // The assistant's conversations belong to the learner who had them: gone at sign-out.
        assistantThreadStore.start();

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
