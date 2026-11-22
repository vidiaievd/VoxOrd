import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDiscardedBySchool, useHeldBySchool } from '../../../hooks/usePendingSync';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { exerciseOutboxStore } from '../../../store/exerciseOutboxStore';

/**
 * Work done offline that the school refused on sync because it is read only (plan 90,
 * phase 5): the answers are not lost, and the learner is told why they have not gone out.
 * Answers a purged school will never take are dropped; the learner is told once, until they
 * dismiss it (Q16).
 */
export function HeldBySchool() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const held = useHeldBySchool();
  const discarded = useDiscardedBySchool();

  if (held === 0 && discarded === 0) return null;

  const card = [styles.card, { backgroundColor: colors.accent900, borderColor: colors.accent800 }];
  const text = [typography.meta, { color: colors.accent200 }];

  return (
    <View style={styles.stack}>
      {held > 0 && (
        <View accessibilityRole="alert" testID="held-by-school" style={card}>
          <Text style={text}>{t('schoolLifecycle.held', { count: held })}</Text>
        </View>
      )}
      {discarded > 0 && (
        <View accessibilityRole="alert" testID="discarded-by-school" style={[card, styles.row]}>
          <Text style={[text, styles.grow]}>
            {t('schoolLifecycle.discarded', { count: discarded })}
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="discarded-by-school-dismiss"
            hitSlop={8}
            onPress={() => void exerciseOutboxStore.dismissDiscarded()}
          >
            <Text style={[typography.meta, styles.dismiss, { color: colors.accent200 }]}>
              {t('schoolLifecycle.discardedDismiss')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  dismiss: { fontWeight: '700' },
});
