import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { AudioPlayer } from './AudioPlayer';

interface ListenStageProps {
  mediaId: string | null;
  audioLabel: string;
  onNext: () => void;
}

/** Stage 1 — audio-first, no transcript shown (mirrors the web reader's listen stage). */
export function ListenStage({ mediaId, audioLabel, onNext }: ListenStageProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Text style={styles.iconGlyph}>🎧</Text>
      </View>
      <Text style={styles.heading}>{t('audioLesson.listenHeading')}</Text>
      <Text style={styles.body}>{t('audioLesson.listenBody')}</Text>
      <AudioPlayer mediaId={mediaId} label={audioLabel} />
      <TouchableOpacity style={styles.cta} onPress={onNext}>
        <Text style={styles.ctaText}>{t('audioLesson.listenCta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      padding: 20,
      alignItems: 'center',
    },
    icon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    iconGlyph: {
      fontSize: 34,
    },
    heading: {
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
      maxWidth: 320,
    },
    cta: {
      marginTop: 28,
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
