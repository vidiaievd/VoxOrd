import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsGroup, SettingsRow, SubScreen } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { AboutGroup } from './sections/AboutGroup';
import { AppearanceGroup } from './sections/AppearanceGroup';
import { DeveloperSection } from './sections/DeveloperSection';
import { LearningGroup } from './sections/LearningGroup';
import { NotificationsGroup } from './sections/NotificationsGroup';
import { OfflineGroup } from './sections/OfflineGroup';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenLanguage: () => void;
  onOpenAccount: () => void;
}

/** Settings (Profile §6.3): device and account preferences, nested under the Profile tab. */
export function SettingsScreen({
  onBack,
  onOpenLanguage,
  onOpenAccount,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('nav.profile')}
        onBack={onBack}
        title={t('settings.title')}
      >
        {/* Temporary: the Profile root takes over the way into Account in step 5. */}
        <SettingsGroup>
          <SettingsRow
            isFirst
            type="navigate"
            icon="UserCircle"
            label={t('settings.account')}
            onPress={onOpenAccount}
          />
        </SettingsGroup>
        <LearningGroup />
        <NotificationsGroup />
        <OfflineGroup />
        <AppearanceGroup onOpenLanguage={onOpenLanguage} />
        <AboutGroup />
        {__DEV__ ? <DeveloperSection /> : null}
      </SubScreen>
    </SafeAreaView>
  );
}
