import { useState, useEffect } from 'react';
import { apiSettingsStore, ApiSettings } from '../store/apiSettingsStore';

export function useApiSettings(): ApiSettings {
  const [settings, setSettings] = useState(apiSettingsStore.getAll());

  useEffect(() => {
    const unsubscribe = apiSettingsStore.subscribe(() => {
      setSettings(apiSettingsStore.getAll());
    });
    return unsubscribe;
  }, []);

  return settings;
}
