import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Tts from 'react-native-tts';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useTranslation } from '../../i18n';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { Button } from '../../components/ui';
import {
  parseGrammaticalForms,
  humanizeFormKey,
  formatTranslation,
  type VocabularyItemDisplay,
} from '../../api/vocabulary';

interface VocabularyItemRowProps {
  item: VocabularyItemDisplay;
  expanded: boolean;
  onToggle: () => void;
  /** The word is in «My words»: the bookmark is filled. */
  mine: boolean;
  onToggleMine: () => void;
  /** The course's TTS locale, when the phone can read it; the recording is used first. */
  speechLocale: string | null;
}

/**
 * One word of a course vocabulary list (Courses §8.4): the speaker, the word with its part
 * of speech and translation, and the bookmark. A vocabulary list is read alongside the lesson
 * text, so it has to work as a reference table, not a quiz. Everything the authors filled in
 * beyond that (inflections, examples, usage notes) is one tap away.
 */
export function VocabularyItemRow({
  item,
  expanded,
  onToggle,
  mine,
  onToggleMine,
  speechLocale,
}: VocabularyItemRowProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const player = useAudioPlayer(item.pronunciationAudioMediaId);

  const translation = formatTranslation(item);
  const forms = parseGrammaticalForms(item.grammaticalProperties);
  const hasDetails =
    forms.length > 0 ||
    item.examples.length > 0 ||
    item.notes !== null ||
    item.register !== null ||
    item.translation?.definition != null ||
    item.translation?.usageNotes != null ||
    item.translation?.falseFriendWarning != null;

  const canSpeak = item.pronunciationAudioMediaId !== null || speechLocale !== null;
  const speak = () => {
    if (item.pronunciationAudioMediaId !== null) {
      player.toggle();
      return;
    }
    if (!speechLocale) return;
    Tts.setDefaultLanguage(speechLocale)
      .catch(() => undefined)
      .finally(() => {
        Tts.stop();
        Tts.speak(item.word);
      });
  };

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        {canSpeak ? (
          <Button
            variant="ghost"
            size={36}
            iconOnly
            icon="SpeakerHigh"
            accessibilityLabel={t('lessonReader.listenToWord')}
            onPress={speak}
          />
        ) : (
          <View style={{ width: 36 }} />
        )}

        <Pressable
          style={styles.main}
          onPress={onToggle}
          disabled={!hasDetails}
          accessibilityRole={hasDetails ? 'button' : undefined}
          accessibilityState={hasDetails ? { expanded } : undefined}
        >
          <View style={styles.wordLine}>
            <Text style={[typography.cardTitle, { color: colors.text }]}>{item.word}</Text>
            {item.partOfSpeech !== null && (
              <Text style={[typography.meta, { color: colors.neutral500 }]}>
                {partOfSpeechLabel(item.partOfSpeech, t)}
              </Text>
            )}
            {item.personal && (
              <Text style={[typography.meta, { color: colors.accent300 }]}>
                {t('myWords.mineBadge')}
              </Text>
            )}
          </View>
          {item.ipaTranscription !== null && (
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {item.ipaTranscription}
            </Text>
          )}
          <Text
            style={[
              typography.secondary,
              { color: colors.neutral400 },
              !translation && { fontStyle: 'italic' },
            ]}
          >
            {translation ?? t('vocabulary.noTranslation')}
          </Text>
        </Pressable>

        <Button
          variant="ghost"
          size={44}
          iconOnly
          icon="BookmarkSimple"
          iconWeight={mine ? 'fill' : 'regular'}
          accessibilityLabel={
            mine ? t('vocabulary.removeFromMyWords') : t('vocabulary.addToMyWords')
          }
          onPress={onToggleMine}
          style={{ borderWidth: 0 }}
        />
      </View>

      {expanded && hasDetails && (
        <View style={styles.details}>
          {item.translation?.definition != null && (
            <Text style={styles.definition}>{item.translation.definition}</Text>
          )}

          {forms.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('vocabulary.forms')}</Text>
              {forms.map((form) => (
                <View key={form.key} style={styles.formRow}>
                  <Text style={styles.formLabel}>{humanizeFormKey(form.key)}</Text>
                  <Text style={styles.formValue}>{form.value}</Text>
                </View>
              ))}
            </View>
          )}

          {item.examples.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('vocabulary.examples')}</Text>
              {item.examples.map((example) => (
                <View key={example.id} style={styles.example}>
                  <Text style={styles.exampleText}>{example.exampleText}</Text>
                  {example.translation !== null && !example.immersionMode && (
                    <Text style={styles.exampleTranslation}>
                      {example.translation.translatedText}
                    </Text>
                  )}
                  {example.contextNote !== null && (
                    <Text style={styles.note}>{example.contextNote}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {item.translation?.usageNotes != null && (
            <Text style={styles.note}>{item.translation.usageNotes}</Text>
          )}
          {item.translation?.falseFriendWarning != null && (
            <Text style={styles.warning}>{item.translation.falseFriendWarning}</Text>
          )}
          {item.notes !== null && <Text style={styles.note}>{item.notes}</Text>}
          {item.register !== null && (
            <Text style={styles.note}>
              {t('vocabulary.register', { register: item.register })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Part-of-speech values come from content-service's `PartOfSpeech` enum. Any
 * value outside the known set (or a future addition) falls back to the raw
 * string rather than rendering blank.
 */
function partOfSpeechLabel(pos: string, t: (path: string) => string): string {
  const known: Record<string, string> = {
    noun: 'vocabulary.posNoun',
    verb: 'vocabulary.posVerb',
    adjective: 'vocabulary.posAdjective',
    adverb: 'vocabulary.posAdverb',
    pronoun: 'vocabulary.posPronoun',
    preposition: 'vocabulary.posPreposition',
    conjunction: 'vocabulary.posConjunction',
    interjection: 'vocabulary.posInterjection',
    numeral: 'vocabulary.posNumeral',
    particle: 'vocabulary.posParticle',
    phrase: 'vocabulary.posPhrase',
    other: 'vocabulary.posOther',
  };
  const key = known[pos.toLowerCase()];
  return key ? t(key) : pos;
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      borderTopWidth: 1,
      borderTopColor: colors.neutral800,
      marginHorizontal: 18,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 10,
    },
    main: {
      flex: 1,
      gap: 2,
    },
    wordLine: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 8,
    },
    details: {
      paddingLeft: 46,
      paddingBottom: 12,
      gap: 2,
    },
    definition: {
      fontSize: 13,
      color: colors.neutral300,
      lineHeight: 19,
      marginBottom: 8,
    },
    block: {
      marginBottom: 10,
    },
    blockTitle: {
      fontSize: 11,
      color: colors.neutral500,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    formRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    formLabel: {
      fontSize: 13,
      color: colors.neutral500,
      flex: 1,
      marginRight: 8,
    },
    formValue: {
      fontSize: 13,
      color: colors.text,
      textAlign: 'right',
      flexShrink: 1,
    },
    example: {
      marginBottom: 6,
    },
    exampleText: {
      fontSize: 13,
      color: colors.text,
      fontStyle: 'italic',
      lineHeight: 19,
    },
    exampleTranslation: {
      fontSize: 12,
      color: colors.neutral500,
      lineHeight: 18,
    },
    note: {
      fontSize: 12,
      color: colors.neutral500,
      lineHeight: 18,
      marginTop: 2,
    },
    warning: {
      fontSize: 12,
      color: colors.neutral300,
      lineHeight: 18,
      marginTop: 2,
    },
  });
