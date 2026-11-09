import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useVocabularyList } from '../../hooks/useVocabularyList';
import { useVocabularyImport } from '../../hooks/useVocabularyImport';
import { useListMyWords } from '../../hooks/useListMyWords';
import { useUnitNumber } from '../../hooks/useUnitNumber';
import { vocabularyImportRepository } from '../../repositories/VocabularyImportRepository';
import { deckRepository, type Deck } from '../../repositories/DeckRepository';
import { speechLocale } from '../../lib/speechLocale';
import { Button, NavHeader, Spinner, useToast } from '../../components/ui';
import type { VocabularyItemDisplay } from '../../api/vocabulary';
import { VocabularyItemRow } from './VocabularyItemRow';
import { filterItems } from './filterItems';

interface VocabularyListScreenProps {
  listId: string;
  /** The unit the list belongs to — its number is the header's parent label. */
  unitId: string;
  courseId: string;
  onBack: () => void;
  /** Opens the list's deck, the way a deck is opened from the Practice tab. */
  onLearn: (deck: Deck) => void;
}

/** A course vocabulary list (Courses §8.4): read it, bookmark words, study it with cards. */
export function VocabularyListScreen({
  listId,
  unitId,
  courseId,
  onBack,
  onLearn,
}: VocabularyListScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const toast = useToast();
  const unitNumber = useUnitNumber(courseId, unitId);
  const { status, data, error, refreshing, refresh } = useVocabularyList(listId);
  const importer = useVocabularyImport(listId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [preparing, setPreparing] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const myWords = useListMyWords(listId, items);
  const shown = useMemo(() => filterItems(items, query), [items, query]);
  const locale = speechLocale(myWords.targetLanguage);
  const allMine = items.length > 0 && myWords.mineCount === items.length;

  // Accordion: at most one item open at a time, so a long list stays scannable.
  const toggle = useCallback((itemId: string) => {
    setExpandedId((current) => (current === itemId ? null : itemId));
  }, []);

  /*
    The list becomes a deck on the phone the first time it is studied; after that the deck
    is just opened. Re-syncing an existing deck can drop words the authors removed upstream,
    which is why it is no longer done silently on every visit.
  */
  const learn = useCallback(async () => {
    if (!data || preparing) return;
    setPreparing(true);
    try {
      if (!importer.alreadyImported) await importer.run(data, t('vocabulary.coursesGroup'));
      const deckId = await vocabularyImportRepository.findDeckIdForList(listId);
      const deck = deckId === null ? undefined : (await deckRepository.getAll()).find(d => d.id === deckId);
      if (deck) onLearn(deck);
      else toast.show(t('vocabulary.cardsEmpty'));
    } catch {
      toast.show(t('vocabulary.importError'));
    } finally {
      setPreparing(false);
    }
  }, [data, preparing, importer, listId, onLearn, t, toast]);

  const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 } as const;

  const header = (
    <View style={{ paddingHorizontal: 18, paddingBottom: 12, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ ...typography.h1, fontSize: 24, lineHeight: 30, letterSpacing: -0.2, color: colors.text }}>
          {data?.title ?? t('vocabulary.title')}
        </Text>
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('vocabulary.meta', { count: items.length, mine: myWords.mineCount })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          variant="secondary"
          size={44}
          icon="Cards"
          label={t('vocabulary.learnCards')}
          disabled={preparing || items.length === 0}
          onPress={learn}
          style={{ flex: 1, alignSelf: 'stretch' }}
        />
        {!allMine && (
          <Button
            variant="ghost"
            size={44}
            label={t('vocabulary.addAll')}
            disabled={!myWords.targetLanguage}
            onPress={() => {
              myWords.addAll().catch(() => undefined);
            }}
          />
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <NavHeader
        parentLabel={unitNumber ? t('lessonReader.back', { n: unitNumber }) : t('vocabulary.title')}
        onBack={onBack}
        right={
          status === 'loaded' && items.length > 0
            ? {
                icon: 'MagnifyingGlass',
                accessibilityLabel: t('vocabulary.search'),
                onPress: () => {
                  setSearching(open => !open);
                  setQuery('');
                },
              }
            : undefined
        }
      />

      {searching && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('vocabulary.searchPlaceholder')}
            placeholderTextColor={colors.neutral500}
            accessibilityLabel={t('vocabulary.search')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              ...typography.cardTitle,
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.neutral700,
              color: colors.text,
            }}
          />
        </View>
      )}

      {status === 'loading' && (
        <View style={centered}>
          <Spinner size={24} color={colors.neutral400} />
        </View>
      )}

      {status === 'error' && (
        <View style={centered}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('vocabulary.loadError')}
          </Text>
          <Text style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}>
            {error?.message}
          </Text>
          <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
        </View>
      )}

      {status === 'loaded' && items.length === 0 && (
        <View style={centered}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('vocabulary.noItems')}
          </Text>
        </View>
      )}

      {status === 'loaded' && items.length > 0 && (
        <FlatList
          data={shown}
          keyExtractor={(item: VocabularyItemDisplay) => item.itemId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <VocabularyItemRow
              item={item}
              expanded={expandedId === item.itemId}
              onToggle={() => toggle(item.itemId)}
              mine={myWords.isMine(item)}
              onToggleMine={() => myWords.toggle(item)}
              speechLocale={locale}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text
              style={[typography.body, { color: colors.neutral400, textAlign: 'center', paddingTop: 24 }]}
            >
              {t('vocabulary.noMatches')}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />
          }
        />
      )}
    </SafeAreaView>
  );
}
