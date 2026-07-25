import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useVocabularyList } from '../../hooks/useVocabularyList';
import { useVocabularyImport } from '../../hooks/useVocabularyImport';
import { useModal } from '../../providers/ModalProvider';
import { VocabularyItemRow } from './VocabularyItemRow';
import type { VocabularyItemDisplay, VocabularyListReaderContent } from '../../api/vocabulary';

interface VocabularyListScreenProps {
  listId: string;
  onBack: () => void;
}

/** Read-only view of a course vocabulary list (Phase 5.1). */
export function VocabularyListScreen({ listId, onBack }: VocabularyListScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, data, error, refreshing, refresh } = useVocabularyList(listId);
  const importer = useVocabularyImport(listId);
  const { show, hide } = useModal();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Accordion: at most one item open at a time, so a long list stays scannable.
  const toggle = useCallback((itemId: string) => {
    setExpandedId((current) => (current === itemId ? null : itemId));
  }, []);

  const handleImport = useCallback(
    (reader: VocabularyListReaderContent) => {
      // A re-import re-syncs the deck to the list, which can also drop words the
      // authors removed upstream — worth confirming, unlike a first import.
      if (importer.alreadyImported) {
        show({
          type: 'confirm',
          title: t('vocabulary.updateDeckTitle'),
          message: t('vocabulary.updateDeckMessage'),
          confirmLabel: t('vocabulary.updateDeckConfirm'),
          cancelLabel: t('common.cancel'),
          onConfirm: () => {
            hide();
            void importer.run(reader, t('vocabulary.coursesGroup'));
          },
        });
        return;
      }
      void importer.run(reader, t('vocabulary.coursesGroup'));
    },
    [importer, show, hide, t],
  );

  const items = data?.items ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.title ?? t('vocabulary.title')}
        </Text>
      </View>

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('vocabulary.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'loaded' && items.length === 0 && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('vocabulary.noItems')}</Text>
        </View>
      )}

      {status === 'loaded' && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item: VocabularyItemDisplay) => item.itemId}
          renderItem={({ item }) => (
            <VocabularyItemRow
              item={item}
              expanded={expandedId === item.itemId}
              onToggle={() => toggle(item.itemId)}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.count}>{t('vocabulary.wordCount', { count: items.length })}</Text>
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
        />
      )}

      {status === 'loaded' && items.length > 0 && data !== null && (
        <View style={styles.footer}>
          {importer.status === 'done' && importer.result !== null && (
            <Text style={styles.footerNote}>
              {t('vocabulary.importDone', {
                imported: importer.result.imported,
                updated: importer.result.updated,
              })}
              {importer.result.removed > 0 &&
                ` · ${t('vocabulary.importRemoved', { removed: importer.result.removed })}`}
              {importer.result.skippedNoTranslation > 0 &&
                ` · ${t('vocabulary.importSkipped', {
                  skipped: importer.result.skippedNoTranslation,
                })}`}
            </Text>
          )}
          {importer.status === 'error' && (
            <Text style={styles.footerError}>
              {t('vocabulary.importError')}
              {importer.error ? ` ${importer.error.message}` : ''}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.saveButton, importer.status === 'running' && styles.saveButtonBusy]}
            onPress={() => handleImport(data)}
            disabled={importer.status === 'running'}
            activeOpacity={0.85}
          >
            {importer.status === 'running' ? (
              <ActivityIndicator color={colors.textInverted} />
            ) : (
              <Text style={styles.saveButtonText}>
                {importer.alreadyImported ? t('vocabulary.updateDeck') : t('vocabulary.saveToDeck')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 8,
      marginRight: 8,
    },
    backText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    centerFill: {
      flex: 1,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    count: {
      fontSize: 13,
      color: colors.textMuted,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    list: {
      paddingTop: 12,
      paddingBottom: 24,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    footerNote: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 8,
      textAlign: 'center',
    },
    footerError: {
      fontSize: 12,
      color: colors.danger,
      marginBottom: 8,
      textAlign: 'center',
    },
    saveButton: {
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    saveButtonBusy: {
      opacity: 0.7,
    },
    saveButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });
