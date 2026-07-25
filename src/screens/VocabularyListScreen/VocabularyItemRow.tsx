import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useTranslation } from '../../i18n';
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
}

/**
 * One word of a course vocabulary list. Word, part of speech and translation
 * are always visible — a vocabulary list is read alongside the lesson text, so
 * it has to work as a reference table, not a quiz. Everything the authors filled
 * in beyond that (inflections, examples, usage notes) is one tap away.
 */
export function VocabularyItemRow({ item, expanded, onToggle }: VocabularyItemRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

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

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.head}
        onPress={onToggle}
        activeOpacity={hasDetails ? 0.85 : 1}
        disabled={!hasDetails}
      >
        <View style={styles.headMain}>
          <View style={styles.wordLine}>
            <Text style={styles.word}>{item.word}</Text>
            {item.partOfSpeech !== null && (
              <View style={styles.posBadge}>
                <Text style={styles.posText}>{partOfSpeechLabel(item.partOfSpeech, t)}</Text>
              </View>
            )}
          </View>
          {item.ipaTranscription !== null && (
            <Text style={styles.ipa}>{item.ipaTranscription}</Text>
          )}
          <Text style={translation ? styles.translation : styles.translationMissing}>
            {translation ?? t('vocabulary.noTranslation')}
          </Text>
        </View>
        {hasDetails && <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>}
      </TouchableOpacity>

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
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      marginHorizontal: 16,
      marginBottom: 8,
      overflow: 'hidden',
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
    },
    headMain: {
      flex: 1,
    },
    wordLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    word: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginRight: 8,
    },
    posBadge: {
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: `${colors.accent}22`,
    },
    posText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.accent,
      textTransform: 'lowercase',
    },
    ipa: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    translation: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    translationMissing: {
      fontSize: 14,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: 4,
    },
    chevron: {
      fontSize: 14,
      color: colors.textMuted,
      paddingLeft: 10,
    },
    details: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    definition: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginBottom: 8,
    },
    block: {
      marginBottom: 10,
    },
    blockTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
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
      color: colors.textMuted,
      flex: 1,
      marginRight: 8,
    },
    formValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'right',
      flexShrink: 1,
    },
    example: {
      marginBottom: 6,
    },
    exampleText: {
      fontSize: 13,
      color: colors.textPrimary,
      fontStyle: 'italic',
      lineHeight: 19,
    },
    exampleTranslation: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    note: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: 2,
    },
    warning: {
      fontSize: 12,
      color: colors.warning,
      lineHeight: 18,
      marginTop: 2,
    },
  });
