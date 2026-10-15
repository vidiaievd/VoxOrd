import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../theme/colors';
import { useTheme } from '../providers/ThemeProvider';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { usePendingSync } from '../hooks/usePendingSync';

/**
 * A cold start is offline until the server confirms the session, which online takes a moment.
 * The banner waits this long so that moment does not flash it on every start.
 */
const SHOW_AFTER_MS = 2000;

/**
 * Above the tab bar while the app works from the stored session, without the server
 * (offline plan, B0.5.4): what is answered is kept on the phone and goes out by itself, and
 * how much is waiting. Course screens keep their own banner for data shown from the cache.
 */
export function OfflineSessionBanner() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const { status, offline } = useAuth();
  const pending = usePendingSync();
  const offlineSession = status === 'signedIn' && offline;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!offlineSession) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [offlineSession]);

  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('auth.offlineSessionBanner')}</Text>
      {pending > 0 && (
        <Text style={styles.pending}>
          {t('auth.offlineSessionPending', { count: pending })}
        </Text>
      )}
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
