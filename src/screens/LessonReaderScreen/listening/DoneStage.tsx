import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';

interface DoneStageProps {
  submitting: boolean;
  error: string | null;
  onContinue: () => void;
}

export function DoneStage({ submitting, error, onContinue }: DoneStageProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>{t('audioLesson.doneTitle')}</Text>
      <Text style={styles.body}>{t('audioLesson.doneBody')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.cta} onPress={onContinue} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.ctaText}>{t('audioLesson.doneCta')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    emoji: {
      fontSize: 44,
      marginBottom: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: 12,
    },
    cta: {
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.accent,
    },
    ctaText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });
