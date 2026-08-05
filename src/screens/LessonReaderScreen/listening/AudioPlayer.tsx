import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useAudioPlayer } from '../../../hooks/useAudioPlayer';

interface AudioPlayerProps {
  mediaId: string | null;
  label: string;
  /** Smaller footprint for re-listening inside an exercise stage. */
  compact?: boolean;
}

export function AudioPlayer({ mediaId, label, compact }: AudioPlayerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, error, toggle } = useAudioPlayer(mediaId);

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <TouchableOpacity
        style={[styles.button, compact && styles.buttonCompact]}
        onPress={toggle}
        disabled={isLoading || !mediaId}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.buttonIcon}>{isPlaying ? '❚❚' : '▶'}</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {status === 'error' && (
        <Text style={styles.error}>{error?.message ?? t('audioLesson.playError')}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    containerCompact: {
      paddingVertical: 10,
      borderRadius: 12,
    },
    button: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    buttonCompact: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: 10,
    },
    buttonIcon: {
      color: colors.textInverted,
      fontSize: 16,
    },
    label: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    error: {
      fontSize: 12,
      color: colors.danger,
    },
  });
