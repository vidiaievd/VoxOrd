import React, { useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';
import { Button, Icon, Spinner } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { useVocabularyList } from '../../hooks/useVocabularyList';
import { useVocabularyImport } from '../../hooks/useVocabularyImport';

interface ImportUnresolvedListProps {
  listId: string;
  /** Due cards of this list with no local word — «N words waiting». */
  waiting: number;
  /** Called once the import finishes, so the caller can reload the due queue. */
  onImported: () => void;
}

/**
 * One row in the "nothing due" screen for a due course card whose list was
 * never imported (Practice §7.6, a row-card). Self-contained on purpose — it
 * loads and imports the list itself (same hooks `VocabularyListScreen` uses),
 * so `ReviewSessionScreen` doesn't need the course/unit navigation context a
 * full trip to that screen would require. The unit number of the spec's
 * subtitle is not known for a bare list id, so the line carries the count only.
 */
export function ImportUnresolvedList({ listId, waiting, onImported }: ImportUnresolvedListProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { data } = useVocabularyList(listId);
  const importer = useVocabularyImport(listId);

  useEffect(() => {
    if (importer.status === 'done') onImported();
  }, [importer.status, onImported]);

  const handleImport = useCallback(() => {
    if (!data) return;
    void importer.run(data, t('vocabulary.coursesGroup'));
  }, [data, importer, t]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        paddingVertical: 13,
        paddingHorizontal: 16,
      }}
    >
      <Icon name="CloudArrowDown" size={20} color={colors.neutral300} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
          {data?.title ?? listId}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {importer.status === 'error'
            ? t('vocabulary.loadError')
            : t('reviewSession.unresolvedWaiting', { count: waiting })}
        </Text>
      </View>
      {importer.status === 'running' ? (
        <Spinner size={20} color={colors.accentBase} />
      ) : (
        <Button
          variant="secondary"
          size={36}
          label={importer.alreadyImported ? t('vocabulary.updateDeck') : t('reviewSession.saveList')}
          disabled={!data}
          onPress={handleImport}
        />
      )}
    </View>
  );
}
