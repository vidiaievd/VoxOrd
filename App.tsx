import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedIfEmpty } from './src/db/seed';
import { CardScreen } from './src/screens/CardScreen';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getDatabase();
        await runMigrations(db);
        await seedIfEmpty(db);
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
    <GestureHandlerRootView style={styles.root}>
      <CardScreen />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error:  { color: 'red', padding: 16 },
});