import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useVocabularyList } from '../../hooks/useVocabularyList';
import { useVocabularyImport } from '../../hooks/useVocabularyImport';

interface ImportUnresolvedListProps {
  listId: string;
  /** Called once the import finishes, so the caller can reload the due queue. */
  onImported: () => void;
}

/**
 * One row in the "nothing due" screen for a due course card whose list was
 * never imported. Self-contained on purpose — it loads and imports the list
 * itself (same hooks `VocabularyListScreen` uses), so `ReviewSessionScreen`
 * doesn't need the course/unit navigation context a full trip to that screen
 * would require.
 */
export function ImportUnresolvedList({ listId, onImported }: ImportUnresolvedListProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { data } = useVocabularyList(listId);
  const importer = useVocabularyImport(listId);

  useEffect(() => {
    if (importer.status === 'done') onImported();
  }, [importer.status, onImported]);

  const handleImport = useCallback(() => {
    if (!data) return;
    void importer.run(data, t('vocabulary.coursesGroup'));
  }, [data, importer, t]);

  const label = importer.alreadyImported
    ? t('vocabulary.updateDeck')
    : t('vocabulary.saveToDeck');

  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={1}>
        {data?.title ?? listId}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleImport}
        activeOpacity={0.8}
        disabled={!data || importer.status === 'running'}
      >
        {importer.status === 'running' ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.buttonText}>{label}</Text>
        )}
      </TouchableOpacity>
      {importer.status === 'error' && (
        <Text style={styles.error}>{t('vocabulary.loadError')}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 12,
      padding: 12,
      gap: 10,
      width: '100%',
    },
    title: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
      minWidth: 96,
      alignItems: 'center',
    },
    buttonText: {
      color: colors.textInverted,
      fontSize: 13,
      fontWeight: '600',
    },
    error: {
      position: 'absolute',
      bottom: -18,
      left: 12,
      fontSize: 11,
      color: colors.danger,
    },
  });
