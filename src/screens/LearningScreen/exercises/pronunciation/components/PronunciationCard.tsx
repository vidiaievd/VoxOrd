import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PronunciationItem } from '../../../../../repositories/PronunciationRepository';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../../theme/colors';

interface PronunciationCardProps {
  item: PronunciationItem;
  isSpeaking: boolean;
  showText: boolean; // show reference text after result
  onSpeak: () => void;
}

export function PronunciationCard({
  item,
  isSpeaking,
  showText,
  onSpeak,
}: PronunciationCardProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.card}>
      <Text style={styles.translation}>{item.translation}</Text>

      <TouchableOpacity
        style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]}
        onPress={onSpeak}
        activeOpacity={0.8}
      >
        <Text style={styles.speakBtnIcon}>{isSpeaking ? '🔊' : '🔈'}</Text>
      </TouchableOpacity>

      {showText && <Text style={styles.referenceText}>{item.text}</Text>}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 20,
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 4,
    },
    translation: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 16,
      textAlign: 'center',
    },
    speakBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.accent,
    },
    speakBtnActive: {
      backgroundColor: colors.accent,
    },
    speakBtnIcon: {
      fontSize: 32,
    },
    referenceText: {
      marginTop: 16,
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
