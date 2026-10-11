import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';

/**
 * The self-check control shared by `translate_*` and `error_correction`: a secondary button
 * that names how many checks are left, the summary of the last one, and its error. The verdict
 * per sentence is drawn by the body, beside the sentence it is about.
 */
export function SelfCheckButton({
  label,
  spentLabel,
  left,
  busy,
  disabled,
  summary,
  error,
  onPress,
}: {
  label: string;
  spentLabel: string;
  left: number;
  busy: boolean;
  disabled: boolean;
  summary: string | null;
  error: string | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const off = disabled || busy || left <= 0;
  return (
    <View style={styles.wrap}>
      {summary !== null ? <Text style={styles.summary}>{summary}</Text> : null}
      <TouchableOpacity
        style={[styles.button, off && styles.buttonOff]}
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Text style={styles.buttonText}>{left > 0 ? label : spentLabel}</Text>
        )}
      </TouchableOpacity>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    wrap: { marginTop: 4, marginBottom: 8, gap: 8 },
    summary: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    button: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accent,
      minHeight: 44,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonOff: { borderColor: colors.backgroundPressed, opacity: 0.6 },
    buttonText: { fontSize: 15, fontWeight: '700', color: colors.accent },
    error: { fontSize: 13, color: colors.danger },
  });
