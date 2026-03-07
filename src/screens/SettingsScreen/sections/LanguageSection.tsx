import React from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useSettings } from '../../../hooks/useSettings';
import { LanguageCode } from '../../../db/types';
import { useModal } from '../../../components/modal';
import { settingsStore } from '../../../store/settingsStore';
import { PickerOption } from '../../../components/BottomSheetPicker';

const LANGUAGE_OPTIONS: PickerOption<LanguageCode>[] = [
  { value: 'ru', label: 'Русский',    icon: '🇷🇺' },
  { value: 'uk', label: 'Українська', icon: '🇺🇦' },
  { value: 'en', label: 'English',    icon: '🇬🇧' },
];

export function LanguageSection() {
  const { t } = useTranslation();

  const { show } = useModal();

  const settings = useSettings();

  const currentLabel = LANGUAGE_OPTIONS.find(
    (o) => o.value === settings.uiLanguage
  )?.label ?? settings.uiLanguage;

  return (
    <SettingsSection title={t('settings.languageRegion')}>
      <SettingsRow
        type="select"
        icon="🌍"
        label={t('settings.languageRegion')}
        value={currentLabel}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.uiLanguage'),
            options: LANGUAGE_OPTIONS,
            current: settings.uiLanguage,
            onSelect: code => settingsStore.set('uiLanguage', code),
            closeLabel: t('common.close'),
          })
        }
      />
      <SettingsRow
        type="select"
        icon="🇳🇴"
        label={t('settings.learningLang')}
        value={t('settings.learningLangValNO')}
        onPress={() => {}}
        isLast
      />
    </SettingsSection>
  );
}
