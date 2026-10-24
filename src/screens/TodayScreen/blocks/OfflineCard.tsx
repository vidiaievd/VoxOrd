import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOfflineSessionVisible } from '../../../hooks/useOfflineSession';
import { usePendingSync, useSyncQueueNearlyFull } from '../../../hooks/usePendingSync';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { Icon } from '../../../components/ui';

/**
 * Block 0. Above the scroll, so it stays in view. The shared banner above the tab bar is
 * hidden on Today while this shows (it reads the same hook, so the two never disagree).
 */
export function OfflineCard() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const visible = useOfflineSessionVisible();
  const pending = usePendingSync();
  const nearlyFull = useSyncQueueNearlyFull();

  if (!visible) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: colors.accent900, borderColor: colors.accent800 }]}
    >
      <Icon name="CloudSlash" size={18} color={colors.accent200} />
      <View style={styles.texts}>
        <Text style={[typography.meta, { color: colors.accent200 }]}>
          {t('auth.offlineSessionBanner')}
        </Text>
        {nearlyFull ? (
          <Text style={[typography.meta, { color: colors.accent200 }]}>
            {t('auth.offlineQueueNearlyFull')}
          </Text>
        ) : null}
      </View>
      {pending > 0 ? (
        <Text style={[typography.meta, { color: colors.neutral400 }]}>
          {t('auth.offlineSessionPending', { count: pending })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginHorizontal: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  texts: { flex: 1 },
});
