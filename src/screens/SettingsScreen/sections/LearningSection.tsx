import React from 'react';
import { Alert } from 'react-native';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';

const SESSION_OPTIONS = [10, 20, 30, 50];

export function LearningSection() {
  const settings = useSettings();

  const handleSessionPress = () => {
    Alert.alert(
      'Карточек за сессию',
      undefined,
      SESSION_OPTIONS.map(n => ({
        text: String(n),
        onPress: () => settingsStore.set('cardsPerSession', n),
      })),
    );
  };

  return (
    <SettingsSection title="Обучение">
      <SettingsRow
        type="navigate"
        icon="🃏"
        label="Режимы карточек"
        badge={`${settings.cardModes.length} активно`}
        onPress={() => {}}
      />
      <SettingsRow
        type="select"
        icon="🔢"
        label="Карточек за сессию"
        value={String(settings.cardsPerSession)}
        onPress={handleSessionPress}
      />
      <SettingsRow
        type="toggle"
        icon="📖"
        label="Показывать формы слов"
        value={settings.showWordForms}
        onChange={v => settingsStore.set('showWordForms', v)}
      />
      <SettingsRow
        type="toggle"
        icon="🔗"
        label="Ссылка на Ordboken"
        value={settings.showOrdbokenLink}
        onChange={v => settingsStore.set('showOrdbokenLink', v)}
        isLast
      />
    </SettingsSection>
  );
}
