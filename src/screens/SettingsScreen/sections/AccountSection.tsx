import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useAuth } from '../../../hooks/useAuth';
import { usePendingSync } from '../../../hooks/usePendingSync';
import { useModal } from '../../../providers/ModalProvider';
import { authService } from '../../../api/auth';
import { biometryAvailable, setBiometricSignIn } from '../../../api/biometric';
import { biometricStore } from '../../../store/biometricStore';

/**
 * Only rendered when a platform session exists — signing in happens on the
 * sign-in screen the navigator shows before the app (screens/AuthScreen).
 */
export function AccountSection() {
  const { t } = useTranslation();
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

  if (status !== 'signedIn' || !user) return null;

  // Signing out keeps what is not sent yet — it waits for this learner — but offline there
  // is no signing back in until the connection returns, and the learner should know both.
  const signOutMessage = [
    pending > 0
      ? t('settings.signOutPendingMessage', { count: pending })
      : t('settings.signOutConfirmMessage'),
    ...(offline ? [t('settings.signOutOfflineNote')] : []),
  ].join('\n\n');

  return (
    <SettingsSection title={t('settings.account')}>
      <SettingsRow
        type="navigate"
        icon="👤"
        label={`${t('settings.signedInAs')} ${user.email ?? user.id}`}
        onPress={() => {}}
      />
      {canBiometric ? (
        <SettingsRow
          type="toggle"
          icon="🔐"
          label={t('auth.biometric.settingLabel')}
          value={biometricOn}
          onChange={toggleBiometric}
        />
      ) : null}
      <SettingsRow
        type="navigate"
        icon="🚪"
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
        isLast
      />
    </SettingsSection>
  );
}
