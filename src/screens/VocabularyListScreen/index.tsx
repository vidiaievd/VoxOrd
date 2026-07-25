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
import { VocabularyItemRow } from './VocabularyItemRow';
import type { VocabularyItemDisplay } from '../../api/vocabulary';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Accordion: at most one item open at a time, so a long list stays scannable.
  const toggle = useCallback((itemId: string) => {
    setExpandedId((current) => (current === itemId ? null : itemId));
  }, []);

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
  });
