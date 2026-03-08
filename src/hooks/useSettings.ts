import { useState, useEffect } from 'react';
import { settingsStore, AppSettings } from '../store/settingsStore';

export function useSettings(): AppSettings {
  const [settings, setSettings] = useState(settingsStore.getAll());

  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getAll());
    });
    return unsubscribe;
  }, []);

  return settings;
}
