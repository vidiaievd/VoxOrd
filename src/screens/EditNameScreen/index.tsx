import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateMyDisplayName } from '../../api/account';
import { getMyDisplayName } from '../../api/ownProfile';
import { Button, SubScreen } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useSwrResource } from '../../hooks/useSwrResource';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

const MAX_LENGTH = 60;

/** The name the learner goes by (Profile §7.1): one field, saved to the profile, then back. */
export function EditNameScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'signedIn' && user ? user.id : null;

  const loader = useCallback(() => getMyDisplayName(), []);
  const name = useSwrResource<string | null>(
    userId ? `profile-name:${userId}` : null,
    loader,
  );
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Prefill once the stored name arrives, unless the learner has already started typing.
  useEffect(() => {
    if (!touched && name.data) setValue(name.data);
  }, [name.data, touched]);

  const trimmed = value.trim();
  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await updateMyDisplayName(trimmed);
      await name.refresh();
      onBack();
    } catch {
      setFailed(true);
    } finally {
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
        title={t('account.editNameTitle')}
        footer={
          <Button
            block
            size={48}
            label={t('common.save')}
            disabled={trimmed.length === 0 || trimmed === name.data}
            busy={busy}
            onPress={save}
          />
        }
      >
        <TextInput
          value={value}
          onChangeText={v => {
            setTouched(true);
            setValue(v);
          }}
          maxLength={MAX_LENGTH}
          placeholder={t('account.name')}
          placeholderTextColor={colors.neutral500}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={trimmed ? save : undefined}
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
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t('account.editNameHint')}
        </Text>
        {failed ? (
          <Text style={[typography.secondary, { color: colors.danger }]}>
            {t('account.nameSaveFailed')}
          </Text>
        ) : null}
      </SubScreen>
    </SafeAreaView>
  );
}
