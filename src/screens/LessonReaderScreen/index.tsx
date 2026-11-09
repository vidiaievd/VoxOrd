import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTranslationLanguage } from '../../hooks/useAccountPrefs';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { useLessonReader } from '../../hooks/useLessonReader';
import { useMarkLessonRead } from '../../hooks/useMarkLessonRead';
import { useUnitNumber } from '../../hooks/useUnitNumber';
import { buildGlossaryIndex } from '../../utils/tokenizeGlossary';
import { ParagraphView } from './ParagraphView';
import { AudioLessonView } from './AudioLessonView';
import { NarrationBar } from './NarrationBar';
import { useNarration, useNarrationId } from '../../hooks/useNarration';
import { wordCaptureQueueStore } from '../../store/wordCaptureQueueStore';
import { settingsStore, READER_FONT_SIZES } from '../../store/settingsStore';
import { syncMyWords } from '../../lib/myWordsSync';
import { paragraphTones } from '../../lib/text/narrationProgress';
import { useSettings } from '../../hooks/useSettings';
import { Button, NavHeader, Spinner } from '../../components/ui';
import { ReaderCaptureContext, type ReaderCapture } from './captureContext';

interface LessonReaderScreenProps {
  lessonId: string;
  courseId: string;
  /** The unit the text belongs to — its number is the header's parent label. */
  unitId: string;
  onBack: () => void;
  /**
   * Go on to the exercises this text leads into — the button at the end of the text, the
   * way a grammar rule leads into its practice. Absent when there are none, and the button
   * then closes the reader instead.
   */
  onPractice?: () => void;
  /**
   * The text was read before. Then the button stays pinned under the text, a way straight
   * on; a text not read yet has it only at its end, past the last paragraph — reaching it is
   * the reading.
   */
  alreadyRead?: boolean;
}

export function LessonReaderScreen({
  lessonId,
  courseId,
  unitId,
  onBack,
  onPractice,
  alreadyRead = false,
}: LessonReaderScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { show } = useModal();
  const { readerFontSize } = useSettings();
  const unitNumber = useUnitNumber(courseId, unitId);
  const { status, data, error, refresh } = useLessonReader(lessonId, courseId);
  const { status: markStatus, error: markError, markAsRead } = useMarkLessonRead(lessonId);
  // A text's recording, when it has one (plan 74 narrates texts into it). Looked for only on
  // a text: an audio lesson's whole screen is its recording already.
  const narrationId = useNarrationId(data?.kind === 'text' ? data.mediaIds : []);
  const narration = useNarration(narrationId);
  const glossaryIndex = useMemo(
    () => buildGlossaryIndex(data?.glossary ?? []),
    [data?.glossary],
  );
  // Words can be added to «My words» once the text's language is known.
  const capture = useMemo<ReaderCapture | null>(
    () =>
      data?.targetLanguage
        ? {
            targetLanguage: data.targetLanguage,
            variantId: data.variantId ?? null,
            paragraphIndex: null,
          }
        : null,
    [data?.targetLanguage, data?.variantId],
  );

  const paragraphs = useMemo(() => data?.paragraphs ?? [], [data?.paragraphs]);
  const tones = useMemo(
    () =>
      paragraphTones(
        paragraphs.map(p => p.target.length),
        {
          started: narration.status === 'playing' || narration.status === 'paused',
          position: narration.position,
          duration: narration.duration,
        },
      ),
    [paragraphs, narration.status, narration.position, narration.duration],
  );

  // Words added while offline go out when a text is opened with a connection again.
  const translationLanguage = useTranslationLanguage();
  useEffect(() => {
    wordCaptureQueueStore
      .flush()
      .then((delivered) => (delivered.size > 0 ? syncMyWords(translationLanguage) : undefined))
      .catch(() => undefined);
  }, [translationLanguage]);

  const openTextSize = () =>
    show({
      type: 'picker',
      title: t('lessonReader.textSize'),
      current: readerFontSize,
      closeLabel: t('common.close'),
      options: READER_FONT_SIZES.map(size => ({
        value: size,
        label: `${{ 15: t('lessonReader.textSizeSmall'), 17: t('lessonReader.textSizeMedium'), 20: t('lessonReader.textSizeLarge') }[size]} · ${size}`,
      })),
      onSelect: (size: (typeof READER_FONT_SIZES)[number]) => {
        settingsStore.set('readerFontSize', size).catch(() => undefined);
      },
    });

  /*
    Reaching the end of the text is what marks it read. Going on to the exercises does not
    wait on that mark: a lost request is progress to retry another time, not a reason to keep
    the learner from the practice. Closing does wait, so a failure is shown where it happened.
  */
  const handleFinish = async () => {
    if (onPractice) {
      markAsRead().catch(() => undefined);
      onPractice();
      return;
    }
    const ok = await markAsRead();
    if (ok) onBack();
  };

  const finishControls = (
    <View style={{ gap: 8 }}>
      {markStatus === 'error' && (
        <Text style={[typography.secondary, { color: colors.neutral400, textAlign: 'center' }]}>
          {markError?.message}
        </Text>
      )}
      <Button
        block
        size={48}
        variant="primary"
        label={onPractice ? t('lessonReader.toExercises') : t('lessonReader.finish')}
        disabled={markStatus === 'submitting'}
        onPress={handleFinish}
      />
    </View>
  );

  const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 } as const;
  const title = data?.displayTitle ?? data?.title ?? t('lessonReader.title');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <NavHeader
        parentLabel={unitNumber ? t('lessonReader.back', { n: unitNumber }) : t('lessonReader.title')}
        onBack={onBack}
        right={
          data?.kind === 'text'
            ? {
                icon: 'TextAa',
                accessibilityLabel: t('lessonReader.textSize'),
                onPress: openTextSize,
              }
            : undefined
        }
      />

      {status === 'loading' && (
        <View style={centered}>
          <Spinner size={24} color={colors.neutral400} />
        </View>
      )}

      {status === 'error' && (
        <View style={centered}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('lessonReader.loadError')}
          </Text>
          <Text style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}>
            {error?.message}
          </Text>
          <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
        </View>
      )}

      {status === 'loaded' && data && data.kind !== 'text' && data.kind !== 'audio' && (
        <View style={centered}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('lessonReader.unsupportedKind')}
          </Text>
        </View>
      )}

      {status === 'loaded' && data && data.kind === 'audio' && (
        <AudioLessonView lessonId={lessonId} data={data} onFinished={onBack} />
      )}

      {status === 'loaded' && data && data.kind === 'text' && (
        <>
          {narrationId ? <NarrationBar narration={narration} /> : null}
          <ReaderCaptureContext.Provider value={capture}>
            <ScrollView
              contentContainerStyle={{
                paddingTop: 18,
                paddingHorizontal: 20,
                paddingBottom: 24,
                gap: 14,
              }}
            >
              <Text style={{ ...typography.h1, fontSize: 24, lineHeight: 30, letterSpacing: -0.2, color: colors.text }}>
                {title}
              </Text>
              {paragraphs.map((paragraph, i) => (
                <ParagraphView
                  key={i}
                  paragraph={paragraph}
                  paragraphIndex={i}
                  glossaryIndex={glossaryIndex}
                  textStyle={{ fontSize: readerFontSize, tone: tones[i] ?? 'plain' }}
                />
              ))}
              {paragraphs.length === 0 && (
                <Text style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}>
                  {t('lessonReader.noContent')}
                </Text>
              )}
              {!alreadyRead && <View style={{ marginTop: 14 }}>{finishControls}</View>}
            </ScrollView>
          </ReaderCaptureContext.Provider>
          {alreadyRead && (
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: 14,
                borderTopWidth: 1,
                borderTopColor: colors.neutral800,
              }}
            >
              {finishControls}
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}
