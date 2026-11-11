import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useHeldBySchool } from '../../../hooks/usePendingSync';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';

/**
 * Work done offline that the school refused on sync because it is read only (plan 90,
 * phase 5): the answers are not lost, and the learner is told why they have not gone out.
 */
export function HeldBySchool() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const held = useHeldBySchool();

  if (held === 0) return null;

  return (
    <View
      accessibilityRole="alert"
      testID="held-by-school"
      style={[styles.card, { backgroundColor: colors.accent900, borderColor: colors.accent800 }]}
    >
      <Text style={[typography.meta, { color: colors.accent200 }]}>
        {t('schoolLifecycle.held', { count: held })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
