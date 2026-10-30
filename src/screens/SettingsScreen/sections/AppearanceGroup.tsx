import React from 'react';
import { SettingsGroup, SettingsRow } from '../../../components/ui';
import { useSettings } from '../../../hooks/useSettings';
import {
  UI_LANGUAGE_ENDONYMS,
  isUiLanguage,
  useTranslation,
} from '../../../i18n';
import { settingsStore, ThemeMode } from '../../../store/settingsStore';

export function AppearanceGroup({
  onOpenLanguage,
}: {
  onOpenLanguage: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const language = isUiLanguage(settings.uiLanguage)
    ? UI_LANGUAGE_ENDONYMS[settings.uiLanguage]
    : t('settings.appLanguageSystem');

  return (
    <SettingsGroup title={t('settings.appearance')}>
      <SettingsRow
        isFirst
        type="segmented"
        icon="Palette"
        label={t('settings.theme')}
        value={settings.theme}
        onChange={v => settingsStore.set('theme', v as ThemeMode)}
        options={[
          {
            value: 'system',
            label: t('settings.themeSystem'),
            icon: 'CircleHalf',
          },
          { value: 'dark', label: t('settings.themeDark'), icon: 'Moon' },
          { value: 'light', label: t('settings.themeLight'), icon: 'Sun' },
        ]}
      />
      <SettingsRow
        type="navigate"
        icon="GlobeSimple"
        label={t('settings.appLanguage')}
        value={language}
        onPress={onOpenLanguage}
      />
    </SettingsGroup>
  );
}
