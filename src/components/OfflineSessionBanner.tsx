import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../theme/colors';
import { useTheme } from '../providers/ThemeProvider';
import { useTranslation } from '../i18n';
import { useOfflineSessionVisible } from '../hooks/useOfflineSession';
import { usePendingSync, useSyncQueueNearlyFull } from '../hooks/usePendingSync';

/**
 * Above the tab bar while the app works from the stored session, without the server
 * (offline plan, B0.5.4): what is answered is kept on the phone and goes out by itself, and
 * how much is waiting. Course screens keep their own banner for data shown from the cache.
 */
export function OfflineSessionBanner() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const pending = usePendingSync();
  const nearlyFull = useSyncQueueNearlyFull();
  const visible = useOfflineSessionVisible();

  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('auth.offlineSessionBanner')}</Text>
      {pending > 0 && (
        <Text style={styles.pending}>
          {t('auth.offlineSessionPending', { count: pending })}
        </Text>
      )}
      {nearlyFull && <Text style={styles.pending}>{t('auth.offlineQueueNearlyFull')}</Text>}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    banner: {
      backgroundColor: colors.warning,
      paddingVertical: 6,
      paddingHorizontal: 16,
    },
    text: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textInverted,
      textAlign: 'center',
    },
    pending: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textInverted,
      textAlign: 'center',
    },
  });
