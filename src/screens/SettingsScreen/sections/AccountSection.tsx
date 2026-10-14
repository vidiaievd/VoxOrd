import React from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useAuth } from '../../../hooks/useAuth';
import { useModal } from '../../../providers/ModalProvider';
import { authService } from '../../../api/auth';

/**
 * Only rendered when a platform session exists — signing in happens on the
 * sign-in screen the navigator shows before the app (screens/AuthScreen).
 */
export function AccountSection() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const { show } = useModal();

  if (status !== 'signedIn' || !user) return null;

  return (
    <SettingsSection title={t('settings.account')}>
      <SettingsRow
        type="navigate"
        icon="👤"
        label={`${t('settings.signedInAs')} ${user.email ?? user.id}`}
        onPress={() => {}}
      />
      <SettingsRow
        type="navigate"
        icon="🚪"
        label={t('settings.signOut')}
        onPress={() =>
          show({
            type: 'confirm',
            title: t('settings.signOutConfirmTitle'),
            message: t('settings.signOutConfirmMessage'),
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
