import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsGroup, SettingsRow, SubScreen } from '../../components/ui';
import { LanguageCode } from '../../db/types';
import { useSettings } from '../../hooks/useSettings';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { settingsStore } from '../../store/settingsStore';

const LANGUAGES: { value: LanguageCode; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'en', label: 'English' },
];

/** Interface language. Step 4 adds «As on the phone» and the AppState re-read. */
export function AppLanguageScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useSettings();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('settings.title')}
        onBack={onBack}
        title={t('settings.appLanguage')}
      >
        <SettingsGroup>
          {LANGUAGES.map((l, i) => (
            <SettingsRow
              key={l.value}
              isFirst={i === 0}
              type="radio"
              icon="GlobeSimple"
              label={l.label}
              checked={settings.uiLanguage === l.value}
              onPress={() => settingsStore.set('uiLanguage', l.value)}
            />
          ))}
        </SettingsGroup>
      </SubScreen>
    </SafeAreaView>
  );
}
