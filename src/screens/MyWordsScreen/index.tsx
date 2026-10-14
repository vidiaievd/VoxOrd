import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { ColorScheme } from '../../theme/colors';
import { useSettings } from '../../hooks/useSettings';
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
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { uiLanguage } = useSettings();
  const { show } = useModal();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      // Words tapped offline first, so they are in the list that comes back.
      await wordCaptureQueueStore.flush().catch(() => undefined);
      const result = await syncMyWords(uiLanguage);
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
  }, [uiLanguage]);

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

  const words = load.status === 'loaded' ? load.words : [];
  const pending = words.filter(w => w.status === 'pending');
  const translated = words.filter(w => w.status === 'resolved');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('myWords.title')}</Text>
      </View>

      {load.status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {load.status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('myWords.loadError')}</Text>
          <Text style={styles.muted}>{load.message}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void reload()}
          >
            <Text style={styles.retryText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {load.status === 'loaded' && (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
              />
            }
          >
            {words.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t('myWords.empty')}</Text>
                <Text style={styles.muted}>{t('myWords.emptyHint')}</Text>
              </View>
            )}

            {load.limitReached && (
              <Text style={styles.note}>{t('myWords.limitReached')}</Text>
            )}

            {pending.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  {t('myWords.pendingSection', { count: pending.length })}
                </Text>
                {pending.map(word => (
                  <PendingRow
                    key={word.entryId}
                    word={word}
                    translationLanguage={uiLanguage}
                    onSaved={reload}
                    onDelete={() => handleDelete(word)}
                  />
                ))}
              </>
            )}

            {translated.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  {t('myWords.wordsSection', { count: translated.length })}
                </Text>
                {translated.map(word => (
                  <TouchableOpacity
                    key={word.entryId}
                    style={styles.row}
                    onLongPress={() => handleDelete(word)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.rowHead}>
                      <Text style={styles.word}>{word.word}</Text>
                      {!word.ownWord && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>
                            {t('myWords.courseBadge')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.translation}>{word.translation}</Text>
                    {word.contextSentence && (
                      <Text style={styles.context} numberOfLines={2}>
                        {word.contextSentence}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
                <Text style={styles.hint}>{t('myWords.deleteHint')}</Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
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
  const styles = makeStyles(colors);
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
    <TouchableOpacity
      style={styles.row}
      onLongPress={onDelete}
      activeOpacity={1}
    >
      <Text style={styles.word}>{word.word}</Text>
      {word.contextSentence && (
        <Text style={styles.context} numberOfLines={2}>
          {word.contextSentence}
        </Text>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder={t('myWords.translationPlaceholderShort')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={save}
          editable={state !== 'saving'}
        />
        <TouchableOpacity
          style={[styles.saveBtn, !value.trim() && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!value.trim() || state === 'saving'}
        >
          {state === 'saving' ? (
            <ActivityIndicator size="small" color={colors.textInverted} />
          ) : (
            <Text style={styles.saveText}>{t('myWords.saveTranslation')}</Text>
          )}
        </TouchableOpacity>
      </View>
      {state === 'error' && (
        <Text style={styles.error}>{t('myWords.saveError')}</Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    fill: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: 8, marginRight: 8 },
    backText: { fontSize: 22, color: colors.textPrimary },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    scroll: { padding: 16, paddingBottom: 40 },
    emptyBox: { paddingVertical: 48, alignItems: 'center' },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    muted: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    note: {
      fontSize: 13,
      color: colors.textSecondary,
      backgroundColor: colors.accentLight,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 8,
    },
    row: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
    },
    rowHead: { flexDirection: 'row', alignItems: 'center' },
    word: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    badge: {
      marginLeft: 8,
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: colors.accent },
    translation: { fontSize: 15, color: colors.textPrimary, marginTop: 2 },
    context: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    input: {
      flex: 1,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      marginRight: 8,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveText: { fontSize: 14, fontWeight: '700', color: colors.textInverted },
    error: { fontSize: 13, color: colors.danger, marginTop: 6 },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.accent,
      borderRadius: 12,
    },
    retryText: { color: colors.textInverted, fontWeight: '700' },
  });
