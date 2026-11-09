import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsGroup, SettingsRow, SubScreen } from '../../components/ui';
import { useSettings } from '../../hooks/useSettings';
import {
  UI_LANGUAGES,
  UI_LANGUAGE_ENDONYMS,
  isUiLanguage,
  resolveUiLanguage,
  useTranslation,
  type UiLanguagePref,
} from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { settingsStore } from '../../store/settingsStore';

/**
 * Interface language (Profile §8.2): «As on the phone» or one of the three. A tap applies at
 * once and stays here — the whole tree, this screen included, re-renders in the new language.
 */
export function AppLanguageScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { uiLanguage } = useSettings();
  const choose = (pref: UiLanguagePref) => settingsStore.set('uiLanguage', pref);
  // The phone's language as the interface would show it, whatever is chosen now.
  const fromPhone = resolveUiLanguage('system');

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
        <SettingsGroup note={t('settings.appLanguageNote')}>
          <SettingsRow
            isFirst
            type="radio"
            icon="DeviceMobile"
            label={t('settings.appLanguageSystem')}
            sub={UI_LANGUAGE_ENDONYMS[fromPhone]}
            // A value an older build stored and the interface has no strings for reads as the phone's.
            checked={!isUiLanguage(uiLanguage)}
            onPress={() => choose('system')}
          />
          {UI_LANGUAGES.map(code => {
            const endonym = UI_LANGUAGE_ENDONYMS[code];
            const name = t(`settings.languageNames.${code}`);
            return (
              <SettingsRow
                key={code}
                type="radio"
                icon="GlobeSimple"
                label={endonym}
                sub={name !== endonym ? name : undefined}
                checked={uiLanguage === code}
                onPress={() => choose(code)}
              />
            );
          })}
        </SettingsGroup>
      </SubScreen>
    </SafeAreaView>
  );
}
