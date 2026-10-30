import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback } from 'react';
import {
  Button,
  SettingsGroup,
  SettingsRow,
  SubScreen,
  SubScreenHero,
} from '../../components/ui';
import { authService } from '../../api/auth';
import { getMyDisplayName } from '../../api/ownProfile';
import { useSwrResource } from '../../hooks/useSwrResource';
import { biometryAvailable, setBiometricSignIn } from '../../api/biometric';
import { useAuth } from '../../hooks/useAuth';
import { usePendingSync } from '../../hooks/usePendingSync';
import { useTranslation } from '../../i18n';
import { useModal } from '../../providers/ModalProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { biometricStore } from '../../store/biometricStore';

/**
 * Account (Profile §7.1): name, e-mail, biometric sign-in, sign-out (the logic of Settings'
 * old `AccountSection`, unchanged) and deletion. Left out: the password row (auth has no
 * change-password route) and Apple / Google rows (auth has neither, G3).
 */
export function AccountScreen({
  onBack,
  onEditName,
  onDeleteAccount,
}: {
  onBack: () => void;
  onEditName: () => void;
  onDeleteAccount: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { status, user, offline } = useAuth();
  const pending = usePendingSync();
  const { show } = useModal();
  const userId = status === 'signedIn' && user ? user.id : null;
  const nameLoader = useCallback(() => getMyDisplayName(), []);
  const name = useSwrResource<string | null>(
    userId ? `profile-name:${userId}` : null,
    nameLoader,
  );
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
        hero={
          status === 'signedIn' && user ? (
            <SubScreenHero
              overline={t('account.kicker')}
              title={name.data ?? user.email ?? user.id}
              meta={name.data ? user.email ?? undefined : undefined}
            />
          ) : undefined
        }
        footer={
          status === 'signedIn' && user ? (
            <>
              <Button
                block
                size={48}
                variant="secondary"
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
              <Button
                block
                size={48}
                variant="ghost"
                label={t('account.delete')}
                disabled={offline}
                onPress={() =>
                  show({
                    type: 'confirm',
                    title: t('account.deleteTitle'),
                    message: t('account.deleteBody'),
                    confirmLabel: t('account.deleteContinue'),
                    cancelLabel: t('common.cancel'),
                    onConfirm: onDeleteAccount,
                  })
                }
              />
              {offline ? (
                <Text
                  style={[
                    typography.meta,
                    { color: colors.neutral500, textAlign: 'center' },
                  ]}
                >
                  {t('account.needsNetwork')}
                </Text>
              ) : null}
            </>
          ) : undefined
        }
      >
        {status === 'signedIn' && user ? (
          <>
            <SettingsGroup title={t('account.groupData')}>
              <SettingsRow
                isFirst
                type="navigate"
                icon="User"
                label={t('account.name')}
                value={name.data ?? t('account.nameEmpty')}
                onPress={onEditName}
              />
              <SettingsRow
                type="value"
                icon="EnvelopeSimple"
                label={t('account.email')}
                value={user.email ?? user.id}
              />
            </SettingsGroup>
            {canBiometric ? (
              <SettingsGroup>
                <SettingsRow
                  isFirst
                  type="toggle"
                  icon="Fingerprint"
                  label={t('auth.biometric.settingLabel')}
                  value={biometricOn}
                  onChange={toggleBiometric}
                />
              </SettingsGroup>
            ) : null}
          </>
        ) : null}
      </SubScreen>
    </SafeAreaView>
  );
}
