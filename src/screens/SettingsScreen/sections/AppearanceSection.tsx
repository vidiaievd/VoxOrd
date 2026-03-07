import React from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore, ThemeMode } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';
import { useModal } from '../../../providers/ModalProvider';

export function AppearanceSection() {
  const { t } = useTranslation();

  const THEMES: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'system', label: t('settings.themeSystem') },
  ];

  const { show } = useModal();

  const settings = useSettings();

  const currentLabel =
    THEMES.find(theme => theme.value === settings.theme)?.label ??
    settings.theme;

  return (
    <SettingsSection title={t('settings.appearance')}>
      <SettingsRow
        type="select"
        icon="🎨"
        label={t('settings.theme')}
        value={currentLabel}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.designTheme'),
            options: THEMES,
            current: settings.theme,
            onSelect: mode => settingsStore.set('theme', mode),
            closeLabel: t('common.close'),
          })
        }
        isLast
      />
    </SettingsSection>
  );
}
