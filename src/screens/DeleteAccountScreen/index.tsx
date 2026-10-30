import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deletionRefusal, requestAccountDeletion } from '../../api/account';
import { authService } from '../../api/auth';
import { Button, SubScreen, useToast } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

/**
 * Second half of deleting the account (Profile §7.1): the password is re-checked on the server.
 * On success every session has already ended there, so the phone forgets its own and the app
 * returns to sign-in; signing in within the grace period cancels the deletion.
 */
export function DeleteAccountScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAccountDeletion(password);
      toast.show(t('account.deleteDone'));
      await authService.forgetLockedSession();
    } catch (e) {
      const refusal = deletionRefusal(e);
      setError(
        refusal === 'wrong_password'
          ? t('account.wrongPassword')
          : refusal === 'contact_support'
          ? t('account.contactSupport')
          : refusal === 'locked'
          ? t('account.locked')
          : t('account.deleteFailed'),
      );
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top']}
    >
      <SubScreen
        backLabel={t('settings.account')}
        onBack={onBack}
        title={t('account.deletePasswordTitle')}
        footer={
          <Button
            block
            size={48}
            variant="secondary"
            label={t('account.deleteConfirm')}
            disabled={password.length === 0}
            busy={busy}
            onPress={submit}
          />
        }
      >
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('account.deletePasswordHint')}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('account.password')}
          placeholderTextColor={colors.neutral500}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={password ? submit : undefined}
          style={[
            typography.body,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              paddingHorizontal: 14,
              paddingVertical: 14,
            },
          ]}
        />
        {error ? (
          <Text style={[typography.secondary, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}
      </SubScreen>
    </SafeAreaView>
  );
}
