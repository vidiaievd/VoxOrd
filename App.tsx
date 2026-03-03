import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getDatabase } from './src/db/database';
import { runMigrations } from './src/db/migrationRunner';
import { seedIfEmpty } from './src/db/seed';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  (async () => {
    try {
      const db = getDatabase();
      await runMigrations(db);

      const check = await db.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='words';`
      );
      console.log('[DB] Tables after migration:', JSON.stringify(check.rows));

      await seedIfEmpty(db);
      setReady(true);
    } catch (e) {
      console.error('[DB] Init error:', e);
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>FlashCards</Text>
      <Text style={styles.subtitle}>DB ready ✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:  { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
  error:  { color: 'red', padding: 16 },
});