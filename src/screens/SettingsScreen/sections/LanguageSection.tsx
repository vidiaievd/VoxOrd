import React from 'react';
import { Alert } from 'react-native';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';
import { LanguageCode } from '../../../db/types';

const UI_LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'pl', label: 'Polski' },
  { code: 'lt', label: 'Lietuvių' },
];

export function LanguageSection() {
  const settings = useSettings();

  const currentLabel =
    UI_LANGUAGES.find(l => l.code === settings.uiLanguage)?.label ??
    settings.uiLanguage;

  const handleLanguagePress = () => {
    Alert.alert(
      'Язык интерфейса',
      undefined,
      UI_LANGUAGES.map(lang => ({
        text: lang.label,
        onPress: () => settingsStore.set('uiLanguage', lang.code),
        style: lang.code === settings.uiLanguage ? 'destructive' : 'default',
      })),
    );
  };

  return (
    <SettingsSection title="Язык и регион">
      <SettingsRow
        type="select"
        icon="🌍"
        label="Язык интерфейса"
        value={currentLabel}
        onPress={handleLanguagePress}
      />
      <SettingsRow
        type="select"
        icon="🇳🇴"
        label="Язык обучения"
        value="Норвежский"
        onPress={() => {}}
        isLast
      />
    </SettingsSection>
  );
}
