import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SessionHeader } from '../../components/practice';
import { Button, Icon, Overline, Skeleton, Tag } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTranslationLanguage } from '../../hooks/useAccountPrefs';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { radii } from '../../theme/spacing';
import {
  deleteMyWord,
  updateMyWord,
  type PersonalWord,
} from '../../api/personalVocabulary';
import { removeMyWord, syncMyWords } from '../../lib/myWordsSync';
import { wordCaptureQueueStore } from '../../store/wordCaptureQueueStore';

interface MyWordsScreenProps {
  onBack: () => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'loaded'; words: PersonalWord[]; limitReached: boolean }
  | { status: 'error'; message: string };

/**
 * The words the student added from texts (plan 75, phase 4). Opening it brings the phone
 * in line with the server — the local «My words» deck and the review cards — so a word
 * translated here is in review the next time review is opened.
 */
export function MyWordsScreen({ onBack }: MyWordsScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const translationLanguage = useTranslationLanguage();
  const { show } = useModal();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      // Words tapped offline first, so they are in the list that comes back.
      await wordCaptureQueueStore.flush().catch(() => undefined);
      const result = await syncMyWords(translationLanguage);
      setLoad({
        status: 'loaded',
        words: result.words,
        limitReached: result.limitReached,
      });
    } catch (e) {
      setLoad({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [translationLanguage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const handleDelete = useCallback(
    (word: PersonalWord) => {
      show({
        type: 'confirm',
        title: t('myWords.deleteTitle', { word: word.word }),
        message: t('myWords.deleteMessage'),
        confirmLabel: t('myWords.deleteConfirm'),
        cancelLabel: t('common.cancel'),
        onConfirm: () => {
          removeMyWord(word, () => deleteMyWord(word.entryId))
            .then(reload)
            .catch(() => undefined);
        },
      });
    },
    [show, t, reload],
  );

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const words = load.status === 'loaded' ? load.words : [];
  const matches = (w: PersonalWord) =>
    !needle ||
    w.word.toLowerCase().includes(needle) ||
    (w.translation ?? '').toLowerCase().includes(needle);
  const pending = words.filter(w => w.status === 'pending' && matches(w));
  const translated = words.filter(w => w.status === 'resolved' && matches(w));

  const toggleSearch = () => {
    setSearching(open => !open);
    setQuery('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <SessionHeader
        title={t('myWords.title')}
        leading="back"
        leadingLabel={t('common.back')}
        onLeading={onBack}
        trailing={{
          icon: 'MagnifyingGlass',
          label: t('myWords.searchOpen'),
          onPress: toggleSearch,
        }}
      />

      {searching && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('myWords.searchPlaceholder')}
            placeholderTextColor={colors.neutral500}
            accessibilityLabel={t('myWords.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              height: 44,
              borderRadius: radii.plate,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              fontSize: 15,
              color: colors.text,
            }}
          />
        </View>
      )}

      {load.status === 'loading' && (
        <View style={{ paddingTop: 4, paddingHorizontal: 18, gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} height={76} radius={14} />
          ))}
        </View>
      )}

      {load.status === 'error' && (
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '500', color: colors.text }}>
            {t('myWords.loadError')}
          </Text>
          <Text style={[typography.body, { color: colors.neutral400 }]}>{load.message}</Text>
          <Button variant="secondary" label={t('courses.retry')} onPress={() => void reload()} />
        </View>
      )}

      {load.status === 'loaded' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              paddingTop: 4,
              paddingHorizontal: 18,
              paddingBottom: 24,
              gap: 10,
            }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent300}
              />
            }
          >
            {words.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 56, gap: 8 }}>
                <Icon name="BookmarkSimple" size={32} color={colors.neutral500} />
                <Text style={{ fontSize: 17, fontWeight: '500', color: colors.text }}>
                  {t('myWords.empty')}
                </Text>
                <Text
                  style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}
                >
                  {t('myWords.emptyHint')}
                </Text>
              </View>
            )}

            {words.length > 0 && pending.length + translated.length === 0 && (
              <Text
                style={[
                  typography.body,
                  { color: colors.neutral400, textAlign: 'center', paddingTop: 32 },
                ]}
              >
                {t('myWords.noMatches')}
              </Text>
            )}

            {load.limitReached && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  padding: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: colors.accent900,
                }}
              >
                <Icon name="Info" size={18} color={colors.accent300} />
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.accent200 }}>
                  {t('myWords.limitReached')}
                </Text>
              </View>
            )}

            {pending.length > 0 && (
              <>
                <View style={{ marginTop: 8 }}>
                  <Overline>{t('myWords.pendingSection', { count: pending.length })}</Overline>
                </View>
                {pending.map(word => (
                  <SwipeToDelete
                    key={word.entryId}
                    label={t('myWords.deleteConfirm')}
                    onDelete={() => handleDelete(word)}
                  >
                    <PendingRow
                      word={word}
                      translationLanguage={translationLanguage}
                      onSaved={reload}
                      onDelete={() => handleDelete(word)}
                    />
                  </SwipeToDelete>
                ))}
              </>
            )}

            {translated.length > 0 && (
              <>
                <View style={{ marginTop: 8 }}>
                  <Overline>{t('myWords.wordsSection', { count: translated.length })}</Overline>
                </View>
                {translated.map(word => (
                  <SwipeToDelete
                    key={word.entryId}
                    label={t('myWords.deleteConfirm')}
                    onDelete={() => handleDelete(word)}
                  >
                    <Pressable
                      accessibilityLabel={`${word.word}. ${word.translation ?? ''}`}
                      accessibilityHint={t('myWords.deleteHint')}
                      onLongPress={() => handleDelete(word)}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: radii.card,
                        padding: 14,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 17, color: colors.text }}>{word.word}</Text>
                        {!word.ownWord && <Tag variant="accent" label={t('myWords.courseBadge')} />}
                      </View>
                      <Text style={{ fontSize: 15, color: colors.neutral200 }}>
                        {word.translation}
                      </Text>
                      <WordMeta word={word} />
                    </Pressable>
                  </SwipeToDelete>
                ))}
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.neutral500,
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  {t('myWords.deleteHint')}
                </Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/** The set a word sits in and the sentence it came from. */
function WordMeta({ word }: { word: PersonalWord }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <Text style={{ fontSize: 12, color: colors.neutral500 }}>
        {word.deck ? t('myWords.deck', { title: word.deck.title }) : t('myWords.noDeck')}
      </Text>
      {word.contextSentence && (
        <Text
          numberOfLines={2}
          style={{ fontSize: 13, lineHeight: 18, fontStyle: 'italic', color: colors.neutral400 }}
        >
          {word.contextSentence}
        </Text>
      )}
    </>
  );
}

/** Swipe a row left to reach a trash button — the same delete as a long press. */
function SwipeToDelete({
  label,
  onDelete,
  children,
}: {
  label: string;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootRight={false}
      renderRightActions={() => (
        <View style={{ justifyContent: 'center', paddingLeft: 8 }}>
          <Button
            variant="secondary"
            iconOnly
            icon="Trash"
            size={52}
            accessibilityLabel={label}
            onPress={() => {
              ref.current?.close();
              onDelete();
            }}
          />
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/** A word still waiting for its translation, with a field to give it one. */
function PendingRow({
  word,
  translationLanguage,
  onSaved,
  onDelete,
}: {
  word: PersonalWord;
  translationLanguage: string;
  onSaved: () => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

  const save = async () => {
    const translation = value.trim();
    if (!translation) return;
    setState('saving');
    try {
      await updateMyWord(word.entryId, { translationLanguage, translation });
      await onSaved();
    } catch {
      setState('error');
    }
  };

  return (
    <Pressable
      onLongPress={onDelete}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 17, color: colors.text }}>{word.word}</Text>
      <WordMeta word={word} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={t('myWords.translationPlaceholderShort')}
          placeholderTextColor={colors.neutral500}
          accessibilityLabel={`${word.word}: ${t('myWords.translationPlaceholderShort')}`}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={save}
          editable={state !== 'saving'}
          style={{
            flex: 1,
            height: 40,
            borderRadius: radii.plate,
            backgroundColor: colors.neutral900,
            paddingHorizontal: 12,
            fontSize: 14,
            color: colors.text,
          }}
        />
        <Button
          size={40}
          label={t('myWords.saveTranslation')}
          disabled={!value.trim()}
          busy={state === 'saving'}
          onPress={save}
        />
      </View>
      {state === 'error' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="WarningCircle" size={14} color={colors.neutral300} />
          <Text style={{ fontSize: 13, color: colors.neutral300 }}>{t('myWords.saveError')}</Text>
        </View>
      )}
    </Pressable>
  );
}
