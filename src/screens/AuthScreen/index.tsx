import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../api/auth';
import { LoginForm } from './LoginForm';

/**
 * What stands before the app until there is a session: the stored one coming back, a way to
 * sign in, or — when the server could not be reached and a session is still stored — «no
 * connection» with a retry rather than a password the learner already gave.
 *
 * A session locked behind the fingerprint gets «unlock» — the prompt again — and a way to
 * give it up for the password.
 *
 * Signing in used to live on the Courses tab, which was a strange place for it: every screen
 * of the app is the learner's courses now, so there is nothing to show before it.
 */
export function AuthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, offline } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await authService.restore();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.title}>VoxOrd</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
      </View>

      {status === 'restoring' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : status === 'locked' ? (
        <View style={styles.center}>
          <Text style={styles.offlineTitle}>{t('auth.biometric.lockedTitle')}</Text>
          <Text style={styles.offlineBody}>{t('auth.biometric.lockedBody')}</Text>
          <TouchableOpacity style={styles.retry} onPress={retry} disabled={retrying}>
            {retrying ? (
              <ActivityIndicator size="small" color={colors.textInverted} />
            ) : (
              <Text style={styles.retryText}>{t('auth.biometric.unlock')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => authService.forgetLockedSession()}
          >
            <Text style={styles.secondaryText}>{t('auth.biometric.usePassword')}</Text>
          </TouchableOpacity>
        </View>
      ) : offline ? (
        <View style={styles.center}>
          <Text style={styles.offlineTitle}>{t('auth.offlineTitle')}</Text>
          <Text style={styles.offlineBody}>{t('auth.offlineBody')}</Text>
          <TouchableOpacity style={styles.retry} onPress={retry} disabled={retrying}>
            {retrying ? (
              <ActivityIndicator size="small" color={colors.textInverted} />
            ) : (
              <Text style={styles.retryText}>{t('courses.retry')}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <LoginForm />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    brand: {
      alignItems: 'center',
      paddingTop: 72,
      paddingHorizontal: 24,
    },
    title: {
      fontSize: 34,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    subtitle: {
      marginTop: 8,
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    offlineTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    offlineBody: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    retry: {
      marginTop: 18,
      minWidth: 140,
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    retryText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    secondary: {
      marginTop: 12,
      paddingVertical: 10,
    },
    secondaryText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accent,
    },
  });
