import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../theme/colors';
import { useTheme } from '../providers/ThemeProvider';
import { useTranslation } from '../i18n';

/**
 * Shown on course screens when a background refresh failed with a network
 * error but cached data is still on screen (Phase 6) — never replaces the
 * screen, just flags that what's shown may be stale.
 */
export function OfflineBanner() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('common.offline')}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    banner: {
      backgroundColor: colors.warning,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    text: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textInverted,
      textAlign: 'center',
    },
  });
