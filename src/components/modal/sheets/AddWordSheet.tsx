import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import { useTranslation } from '../../../i18n';
import { useSettings } from '../../../hooks/useSettings';
import {
  lookupWord,
  type LookupWordResponse,
  type WordCaptureSource,
} from '../../../api/personalVocabulary';
import { wordCaptureQueueStore } from '../../../store/wordCaptureQueueStore';

interface AddWordSheetProps {
  visible: boolean;
  surfaceForm: string;
  source: WordCaptureSource;
  onClose: () => void;
}

type Lookup =
  | { status: 'loading' }
  | { status: 'loaded'; result: LookupWordResponse }
  // No answer — offline, most likely. The word can still be saved; the server decides then.
  | { status: 'unknown' };

type Saving = 'idle' | 'saving' | 'saved' | 'queued' | 'refused';

/** How long «Added» stays on screen before the sheet closes by itself. */
const CLOSE_AFTER_MS = 900;

/**
 * «Add to my words» for a word tapped in a text (plan 75). What a course already knows
 * about the form is shown first: its dictionary form, and its translation — which is then
 * the one used. Otherwise the student may write their own, or none: the word is saved
 * either way and waits for a translation.
 */
export function AddWordSheet({
  visible,
  surfaceForm,
  source,
  onClose,
}: AddWordSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { uiLanguage } = useSettings();
  const styles = makeStyles(colors);

  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [translation, setTranslation] = useState('');
  const [saving, setSaving] = useState<Saving>('idle');

  useEffect(() => {
    let cancelled = false;
    lookupWord({
      targetLanguage: source.targetLanguage,
      translationLanguage: uiLanguage,
      form: surfaceForm,
    })
      .then(result => !cancelled && setLookup({ status: 'loaded', result }))
      .catch(() => !cancelled && setLookup({ status: 'unknown' }));
    return () => {
      cancelled = true;
    };
  }, [surfaceForm, source.targetLanguage, uiLanguage]);

  useEffect(() => {
    if (saving !== 'saved' && saving !== 'queued') return;
    const timer = setTimeout(onClose, CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [saving, onClose]);

  const result = lookup.status === 'loaded' ? lookup.result : null;
  const existing = result?.entry ?? null;
  const catalog = result?.catalog ?? null;
  const catalogTranslation = catalog?.translation ?? null;

  const handleSave = async () => {
    setSaving('saving');
    const own = translation.trim();
    const outcome = await wordCaptureQueueStore.submit({
      targetLanguage: source.targetLanguage,
      translationLanguage: uiLanguage,
      surfaceForm,
      ...(own && !catalogTranslation ? { translation: own } : {}),
      ...(source.contextSentence
        ? { contextSentence: source.contextSentence }
        : {}),
      ...(source.sourceVariantId
        ? { sourceVariantId: source.sourceVariantId }
        : {}),
      ...(source.sourceParagraph !== null
        ? { sourceParagraph: source.sourceParagraph }
        : {}),
    });
    setSaving(outcome.kind === 'saved' ? 'saved' : outcome.kind);
  };

  const headword = existing?.word ?? catalog?.word ?? surfaceForm;
  const partOfSpeech = existing?.partOfSpeech ?? catalog?.partOfSpeech ?? null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.word}>{headword}</Text>
            {partOfSpeech && (
              <View style={styles.posBadge}>
                <Text style={styles.posText}>{partOfSpeech}</Text>
              </View>
            )}
          </View>
          {headword.toLowerCase() !== surfaceForm.toLowerCase() && (
            <Text style={styles.muted}>
              {t('myWords.inText', { form: surfaceForm })}
            </Text>
          )}
          {source.contextSentence && (
            <Text style={styles.context} numberOfLines={3}>
              {source.contextSentence}
            </Text>
          )}

          {lookup.status === 'loading' ? (
            <ActivityIndicator style={styles.spacer} color={colors.accent} />
          ) : existing ? (
            <>
              <Text style={styles.translation}>
                {existing.translation ?? t('myWords.waitingForTranslation')}
              </Text>
              <Text style={styles.muted}>{t('myWords.alreadyAdded')}</Text>
            </>
          ) : catalogTranslation ? (
            <>
              <Text style={styles.translation}>{catalogTranslation}</Text>
              <Text style={styles.muted}>{t('myWords.fromCourse')}</Text>
            </>
          ) : (
            <TextInput
              style={styles.input}
              value={translation}
              onChangeText={setTranslation}
              placeholder={t('myWords.translationPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              returnKeyType="done"
              editable={saving === 'idle' || saving === 'refused'}
              onSubmitEditing={handleSave}
            />
          )}

          {saving === 'saved' && (
            <Text style={styles.done}>{t('myWords.added')}</Text>
          )}
          {saving === 'queued' && (
            <Text style={styles.done}>{t('myWords.queued')}</Text>
          )}
          {saving === 'refused' && (
            <Text style={styles.error}>{t('myWords.refused')}</Text>
          )}

          {!existing &&
            lookup.status !== 'loading' &&
            saving !== 'saved' &&
            saving !== 'queued' && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleSave}
                disabled={saving === 'saving'}
              >
                {saving === 'saving' ? (
                  <ActivityIndicator size="small" color={colors.textInverted} />
                ) : (
                  <Text style={styles.addText}>{t('myWords.save')}</Text>
                )}
              </TouchableOpacity>
            )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    fill: { flex: 1 },
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
      marginBottom: 4,
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
    context: {
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
      marginBottom: 12,
    },
    translation: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 4,
    },
    muted: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 8,
    },
    spacer: { marginVertical: 16 },
    input: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
      marginTop: 4,
      marginBottom: 4,
    },
    done: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.success,
      textAlign: 'center',
      marginTop: 12,
    },
    error: {
      fontSize: 14,
      color: colors.danger,
      textAlign: 'center',
      marginTop: 12,
    },
    addBtn: {
      marginTop: 12,
      paddingVertical: 14,
      backgroundColor: colors.accent,
      borderRadius: 14,
      alignItems: 'center',
    },
    addText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
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
