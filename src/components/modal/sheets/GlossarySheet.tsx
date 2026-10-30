import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import Tts from 'react-native-tts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { useTranslation, useUiLanguage } from '../../../i18n';
import type { ReaderGlossaryEntry } from '../../../api/lessons';
import {
  deleteMyWord,
  lookupWord,
  type PersonalWord,
  type WordCaptureSource,
} from '../../../api/personalVocabulary';
import { wordCaptureQueueStore } from '../../../store/wordCaptureQueueStore';
import { removeMyWord, syncMyWords } from '../../../lib/myWordsSync';
import { speechLocale } from '../../../lib/speechLocale';
import { withAlpha } from '../../ui/color';
import { Button } from '../../ui';

interface GlossarySheetProps {
  visible: boolean;
  entry: ReaderGlossaryEntry;
  /** Present in a text: the word can be added to «My words» from here. */
  capture?: { surfaceForm: string; source: WordCaptureSource };
  onClose: () => void;
}

/** Where the word stands in «My words»: `queued` was added offline and waits for a connection. */
type Mine =
  | { state: 'unknown' }
  | { state: 'no' }
  | { state: 'adding' }
  | { state: 'yes'; word: PersonalWord }
  | { state: 'queued' };

const SLIDE_MS = 220;
const SLIDE_FROM = 300;
const SWIPE_CLOSE = 80;

/**
 * The card of a glossary word in a text (Courses §8.1): the word, its translation, the
 * sentence it was met in, and «My words» under a thumb. The word is saved as before — the
 * capture queue sends it at once, or keeps it until the phone is online — and the button
 * flips the moment it is taken, online or not.
 */
export function GlossarySheet({ visible, entry, capture, onClose }: GlossarySheetProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const uiLanguage = useUiLanguage();
  // The app draws edge to edge: without this the sheet's last button sits under the
  // phone's navigation bar.
  const insets = useSafeAreaInsets();
  const [mine, setMine] = useState<Mine>({ state: 'unknown' });

  const slide = useRef(new Animated.Value(SLIDE_FROM)).current;
  useEffect(() => {
    if (!visible) return;
    slide.setValue(SLIDE_FROM);
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const close = useCallback(() => {
    Animated.timing(slide, {
      toValue: SLIDE_FROM,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [slide, onClose]);

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => slide.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_CLOSE || g.vy > 0.8) {
          Animated.timing(slide, {
            toValue: SLIDE_FROM * 2,
            duration: SLIDE_MS,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          Animated.timing(slide, { toValue: 0, duration: 120, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A word added before is shown as added; with no connection nothing is known and the button
  // offers to add — the server treats a word captured twice as the same word.
  useEffect(() => {
    if (!capture) return;
    let cancelled = false;
    setMine({ state: 'unknown' });
    lookupWord({
      targetLanguage: capture.source.targetLanguage,
      translationLanguage: uiLanguage,
      form: capture.surfaceForm,
    })
      .then(result => {
        if (cancelled) return;
        setMine(result.entry ? { state: 'yes', word: result.entry } : { state: 'no' });
      })
      .catch(() => !cancelled && setMine({ state: 'no' }));
    return () => {
      cancelled = true;
    };
  }, [capture, uiLanguage]);

  useEffect(() => () => void Tts.stop(), []);

  const locale = speechLocale(capture?.source.targetLanguage);
  const speak = () => {
    if (!locale) return;
    Tts.setDefaultLanguage(locale)
      .catch(() => undefined)
      .finally(() => {
        Tts.stop();
        Tts.speak(entry.word);
      });
  };

  const add = async () => {
    if (!capture) return;
    setMine({ state: 'adding' });
    const { source, surfaceForm } = capture;
    const outcome = await wordCaptureQueueStore.submit({
      targetLanguage: source.targetLanguage,
      translationLanguage: uiLanguage,
      surfaceForm,
      ...(entry.translation ? { translation: entry.translation.text } : {}),
      ...(source.contextSentence ? { contextSentence: source.contextSentence } : {}),
      ...(source.sourceVariantId ? { sourceVariantId: source.sourceVariantId } : {}),
      ...(source.sourceParagraph !== null ? { sourceParagraph: source.sourceParagraph } : {}),
    });
    if (outcome.kind === 'saved') {
      setMine({ state: 'yes', word: outcome.response.word });
      syncMyWords(uiLanguage).catch(() => undefined);
    } else if (outcome.kind === 'queued') {
      setMine({ state: 'queued' });
    } else {
      setMine({ state: 'no' });
    }
  };

  const remove = async () => {
    if (mine.state !== 'yes') return;
    const word = mine.word;
    setMine({ state: 'adding' });
    try {
      await removeMyWord(word, () => deleteMyWord(word.entryId));
      setMine({ state: 'no' });
    } catch {
      setMine({ state: 'yes', word });
    }
  };

  const added = mine.state === 'yes' || mine.state === 'queued';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Pressable
        accessibilityLabel={t('common.close')}
        onPress={close}
        style={{ flex: 1, backgroundColor: withAlpha(colors.neutral900, 0.55) }}
      />
      <Animated.View
        style={{
          transform: [{ translateY: slide }],
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 10,
          paddingHorizontal: 20,
          paddingBottom: 10 + insets.bottom,
          gap: 12,
        }}
      >
        <View {...swipe.panHandlers} style={{ paddingVertical: 6 }}>
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.neutral700,
              alignSelf: 'center',
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...typography.h1, fontSize: 24, lineHeight: 30, color: colors.text }}>
              {entry.word}
            </Text>
            {entry.partOfSpeech ? (
              <Text style={[typography.meta, { color: colors.neutral500 }]}>
                {entry.partOfSpeech}
              </Text>
            ) : null}
          </View>
          {locale ? (
            <Button
              variant="secondary"
              size={44}
              iconOnly
              icon="SpeakerHigh"
              accessibilityLabel={t('lessonReader.listenToWord')}
              onPress={speak}
            />
          ) : null}
        </View>

        <Text style={[typography.cardTitleMedium, { color: colors.neutral200 }]}>
          {entry.translation?.text ?? t('lessonReader.noTranslation')}
        </Text>
        {entry.translation?.definition ? (
          <Text style={[typography.body, { color: colors.neutral400 }]}>
            {entry.translation.definition}
          </Text>
        ) : null}
        {capture?.source.contextSentence ? (
          <Text
            numberOfLines={3}
            style={[typography.body, { fontStyle: 'italic', lineHeight: 21, color: colors.neutral400 }]}
          >
            {capture.source.contextSentence}
          </Text>
        ) : null}

        {capture ? (
          <View style={{ gap: 8 }}>
            <Button
              block
              size={48}
              variant={added ? 'secondary' : 'primary'}
              icon="BookmarkSimple"
              iconWeight={added ? 'fill' : 'regular'}
              label={added ? t('lessonReader.inMyWords') : t('lessonReader.addToMyWords')}
              disabled={mine.state === 'adding' || mine.state === 'unknown'}
              onPress={mine.state === 'yes' ? remove : mine.state === 'queued' ? undefined : add}
            />
            <Text style={{ fontSize: 12, textAlign: 'center', color: colors.neutral500 }}>
              {t('lessonReader.addedNote')}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
