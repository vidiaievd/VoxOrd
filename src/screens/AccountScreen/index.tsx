import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsGroup, SettingsRow, SubScreen } from '../../components/ui';
import { authService } from '../../api/auth';
import { biometryAvailable, setBiometricSignIn } from '../../api/biometric';
import { useAuth } from '../../hooks/useAuth';
import { usePendingSync } from '../../hooks/usePendingSync';
import { useTranslation } from '../../i18n';
import { useModal } from '../../providers/ModalProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { biometricStore } from '../../store/biometricStore';

/**
 * Account: sign-in details, biometric sign-in and sign-out — the logic that lived in
 * Settings' `AccountSection`, unchanged. Step 6 adds the name, the password and deletion.
 */
export function AccountScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { status, user, offline } = useAuth();
  const pending = usePendingSync();
  const { show } = useModal();
  const [canBiometric, setCanBiometric] = useState(false);
  const [biometricOn, setBiometricOn] = useState(biometricStore.isEnabled());

  useEffect(() => {
    biometryAvailable().then(setCanBiometric);
  }, []);

  const toggleBiometric = async (on: boolean) => {
    setBiometricOn(on);
    const moved = await setBiometricSignIn(on);
    if (!moved) setBiometricOn(biometricStore.isEnabled());
  };

  // Signing out keeps what is not sent yet — it waits for this learner — but offline there
  // is no signing back in until the connection returns, and the learner should know both.
  const signOutMessage = [
    pending > 0
      ? t('settings.signOutPendingMessage', { count: pending })
      : t('settings.signOutConfirmMessage'),
    ...(offline ? [t('settings.signOutOfflineNote')] : []),
  ].join('\n\n');

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('nav.profile')}
        onBack={onBack}
        title={t('settings.account')}
      >
        {status === 'signedIn' && user ? (
          <SettingsGroup>
            <SettingsRow
              isFirst
              type="value"
              icon="EnvelopeSimple"
              label={t('settings.signedInAs')}
              value={user.email ?? user.id}
            />
            {canBiometric ? (
              <SettingsRow
                type="toggle"
                icon="Fingerprint"
                label={t('auth.biometric.settingLabel')}
                value={biometricOn}
                onChange={toggleBiometric}
              />
            ) : null}
            <SettingsRow
              type="navigate"
              icon="LockSimple"
              label={t('settings.signOut')}
              onPress={() =>
                show({
                  type: 'confirm',
                  title: t('settings.signOutConfirmTitle'),
                  message: signOutMessage,
                  confirmLabel: t('settings.signOut'),
                  cancelLabel: t('common.cancel'),
                  onConfirm: () => {
                    void authService.logout();
                  },
                })
              }
            />
          </SettingsGroup>
        ) : null}
      </SubScreen>
    </SafeAreaView>
  );
}
