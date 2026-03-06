import React from 'react';
import { Alert } from 'react-native';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore, ThemeMode } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: '☀️ Светлая' },
  { mode: 'dark', label: '🌙 Тёмная' },
  { mode: 'system', label: '⚙️ Системная' },
];

export function AppearanceSection() {
  const settings = useSettings();

  const currentLabel =
    THEMES.find(t => t.mode === settings.theme)?.label ?? settings.theme;

  const handleThemePress = () => {
    Alert.alert(
      'Тема оформления',
      undefined,
      THEMES.map(t => ({
        text: t.label,
        onPress: () => settingsStore.set('theme', t.mode),
      })),
    );
  };

  return (
    <SettingsSection title="Внешний вид">
      <SettingsRow
        type="select"
        icon="🎨"
        label="Тема"
        value={currentLabel}
        onPress={handleThemePress}
        isLast
      />
    </SettingsSection>
  );
}
