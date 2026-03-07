import React from 'react';
import { Alert } from 'react-native';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore, ThemeMode } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';

export function AppearanceSection() {
  const { t } = useTranslation();

  const THEMES: { mode: ThemeMode; label: string }[] = [
    { mode: 'light', label: t('settings.themeLight') },
    { mode: 'dark', label: t('settings.themeDark') },
    { mode: 'system', label: t('settings.themeSystem') },
  ];

  const settings = useSettings();

  const currentLabel =
    THEMES.find(theme => theme.mode === settings.theme)?.label ??
    settings.theme;

  const handleThemePress = () => {
    Alert.alert(
      t('settings.designTheme'),
      undefined,
      THEMES.map(theme => ({
        text: theme.label,
        onPress: () => settingsStore.set('theme', theme.mode),
      })),
    );
  };

  return (
    <SettingsSection title={t('settings.appearance')}>
      <SettingsRow
        type="select"
        icon="🎨"
        label={t('settings.theme')}
        value={currentLabel}
        onPress={handleThemePress}
        isLast
      />
    </SettingsSection>
  );
}
