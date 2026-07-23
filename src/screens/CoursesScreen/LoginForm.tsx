import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { authService, MfaNotSupportedError } from '../../api/auth';
import { ApiError } from '../../api/client';

export function LoginForm() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await authService.login(email.trim(), password);
      // On success authStore flips to 'signedIn' and CoursesScreen re-renders;
      // nothing else to do here.
    } catch (e) {
      if (e instanceof MfaNotSupportedError) {
        setError(t('courses.loginMfaNotSupported'));
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(String(e));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={t('courses.loginEmail')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!isSubmitting}
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t('courses.loginPassword')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          editable={!isSubmitting}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverted} />
          ) : (
            <Text style={styles.buttonText}>{t('courses.loginSubmit')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      justifyContent: 'center',
    },
    form: {
      paddingHorizontal: 24,
    },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
      marginBottom: 12,
      lineHeight: 18,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.textInverted,
      fontSize: 15,
      fontWeight: '700',
    },
  });
