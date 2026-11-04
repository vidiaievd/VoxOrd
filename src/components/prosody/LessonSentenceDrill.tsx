import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextProsody } from '../../api/prosody';
import { useTranslation } from '../../i18n';
import { splitSentences } from '../../kernel/text';
import { useTheme } from '../../providers/ThemeProvider';
import type { ProsodyLens } from '../../store/settingsStore';
import type { ColorScheme } from '../../theme/colors';
import { ProsodyText } from './ProsodyText';

/** The markdown signs a sentence may carry; none of them is a word, so the tokens stay the same. */
function plain(raw: string): string {
  return raw
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '')
    .replace(/\*+/g, '')
    .trim();
}

export interface LessonSentenceDrillProps {
  /** The paragraphs that have a layer, by paragraph index. */
  layers: Record<number, TextProsody>;
  /** The lens the sentence is drawn in. */
  lens: ProsodyLens;
}

/**
 * One sentence of a lesson text at a time, read in the chosen lens (platform plan 86, step 7f).
 * The body of a lesson has no attempt, so there is nothing to say into: the card only shows —
 * the recorded counterpart is `ReadAloudSentenceDrill`. Sentences never cross a paragraph, and
 * each is drawn from its paragraph's own layer with its first token as the offset.
 */
export function LessonSentenceDrill({ layers, lens }: LessonSentenceDrillProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [index, setIndex] = useState(0);

  const sentences = useMemo(
    () =>
      Object.keys(layers)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap(paragraph =>
          splitSentences(layers[paragraph]!.text).map(sentence => ({ paragraph, sentence })),
        ),
    [layers],
  );

  const at = Math.min(index, sentences.length - 1);
  const current = sentences[at];
  if (current === undefined) return null;
  const prosody = layers[current.paragraph]!;
  const { sentence } = current;
  const text = plain(prosody.text.slice(sentence.s, sentence.e));
  const first = at === 0;
  const last = at >= sentences.length - 1;

  return (
    <View style={styles.card}>
      <Text style={styles.position}>
        {t('prosody.drill.position', { n: at + 1, total: sentences.length })}
      </Text>
      <View accessibilityLabel={text}>
        <ProsodyText
          text={text}
          layer={prosody.layer}
          sounds={prosody.sounds}
          lens={lens}
          tokenOffset={sentence.first}
          fontSize={18}
          color={colors.text}
        />
      </View>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('prosody.drill.previous')}
          disabled={first}
          onPress={() => setIndex(at - 1)}
          style={[styles.step, first && styles.off]}
        >
          <Text style={styles.stepText}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('prosody.drill.next')}
          disabled={last}
          onPress={() => setIndex(at + 1)}
          style={[styles.step, last && styles.off]}
        >
          <Text style={styles.stepText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    position: { fontSize: 12, color: colors.neutral500 },
    nav: { flexDirection: 'row', gap: 10 },
    step: {
      minWidth: 48,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: { fontSize: 22, color: colors.text },
    off: { opacity: 0.5 },
  });
