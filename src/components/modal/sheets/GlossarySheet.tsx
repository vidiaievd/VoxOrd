import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useTranslation } from '../../../i18n';
import type { ReaderGlossaryEntry } from '../../../api/lessons';

interface GlossarySheetProps {
  visible: boolean;
  entry: ReaderGlossaryEntry;
  onClose: () => void;
}

export function GlossarySheet({ visible, entry, onClose }: GlossarySheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.word}>{entry.word}</Text>
          {entry.partOfSpeech && (
            <View style={styles.posBadge}>
              <Text style={styles.posText}>{entry.partOfSpeech}</Text>
            </View>
          )}
        </View>
        {entry.translation ? (
          <>
            <Text style={styles.translation}>{entry.translation.text}</Text>
            {entry.translation.definition && (
              <Text style={styles.definition}>{entry.translation.definition}</Text>
            )}
          </>
        ) : (
          <Text style={styles.definition}>{t('lessonReader.noTranslation')}</Text>
        )}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
      backgroundColor: colors.backgroundCard,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingBottom: 32,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    word: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginRight: 8,
    },
    posBadge: {
      backgroundColor: colors.accentLight,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    posText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
    translation: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    definition: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    closeBtn: {
      marginTop: 8,
      paddingVertical: 14,
      backgroundColor: colors.backgroundInput,
      borderRadius: 14,
      alignItems: 'center',
    },
    closeText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
