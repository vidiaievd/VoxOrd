import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { ProsodyLayer, WordSounds } from '../../kernel/prosody';
import {
  chunksOf,
  drawnIn,
  faceSegs,
  groupEndSign,
  signParts,
  type Chunk,
  type TokenMarks,
} from '../../lib/prosody/marks';
import { useTheme } from '../../providers/ThemeProvider';
import type { ProsodyLens } from '../../store/settingsStore';
import { typography } from '../../theme/typography';

/** The line height that leaves a line of signs above a line of letters. */
const SIGN_LINE = 0.9;
const WORD_LINE = 1.45;

/**
 * The colour of the letters set invisible on the line of signs. Not `'transparent'`: that is the
 * integer 0, which React Native on Android reads as «no colour given» and paints in the default
 * black. A zero-alpha colour with a non-zero RGB stays invisible.
 */
const INVISIBLE = 'rgba(255, 255, 255, 0)';

/** `color` at `alpha` strength; a colour this cannot parse is returned as it was. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!hex) return color;
  const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface ProsodyTextProps {
  /** The passage exactly as written; the layer's anchors count tokens of this string. */
  text: string;
  layer: ProsodyLayer;
  /** The lexicon's letters-over-sounds of the words, anchored like the layer. */
  sounds?: readonly WordSounds[];
  /** `null` — nothing of the pronunciation is drawn, the text is plain. */
  lens: ProsodyLens | null;
  /** Index in the layer's passage of this text's first word, when it is a part of it. */
  tokenOffset?: number;
  fontSize: number;
  /** The text colour; the font family comes from the theme's typography. */
  color: string;
  style?: StyleProp<TextStyle>;
}

interface WordViewProps {
  word: string;
  marks: TokenMarks | undefined;
  /** What follows the word: spaces and punctuation. */
  trailing: string;
  lens: ProsodyLens;
  fontSize: number;
  color: string;
}

/**
 * One word with its line of signs above it. A running text on a phone cannot carry a mark
 * over a letter, so every word is a small column: the signs on top, the word under. The signs
 * stand where their letters stand because the letters before them are set invisible, in the
 * same font — the sign line never changes the text, only decorates it. The sounds lens has
 * no signs and no such line: its marks are all on the letters.
 */
export function ProsodyWordView({ word, marks, trailing, lens, fontSize, color }: WordViewProps) {
  const { colors } = useTheme();
  const drawn = marks !== undefined && drawnIn(lens, marks);
  const base: TextStyle = { fontFamily: typography.body.fontFamily, fontSize };
  const medium = typography.cardTitleMedium.fontFamily;
  const accentWord = lens === 'melody' && marks?.accent !== undefined;

  // The end of a group stands in the line of the text, after the word's punctuation.
  const groupEnd = groupEndSign(marks, lens);
  const split = /^(\S*)(\s*)$/.exec(trailing);
  const punctuation = split?.[1] ?? trailing;
  const space = split?.[2] ?? '';

  const signs = drawn ? signParts(word, marks, lens) : null;
  const face = drawn ? faceSegs(word, marks, lens) : [{ text: word }];

  return (
    <View>
      {lens === 'sounds' ? null : (
        <Text
          style={[base, { lineHeight: Math.round(fontSize * SIGN_LINE), color: INVISIBLE }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {signs === null
            ? ' '
            : signs.map((part, k) =>
                part.kind === 'gap' ? (
                  part.text
                ) : (
                  <Text
                    key={k}
                    style={{
                      fontSize: Math.round(fontSize * part.scale),
                      color: part.tone === 'accent' ? colors.accent : colors.warning,
                      fontFamily: medium,
                    }}
                  >
                    {part.text}
                  </Text>
                ),
              )}
        </Text>
      )}
      <Text style={[base, { lineHeight: Math.round(fontSize * WORD_LINE), color }]}>
        {face.map((seg, k) => (
          <Text
            key={k}
            style={[
              seg.accent ? { color: colors.accent } : null,
              seg.bold || accentWord ? { fontFamily: medium } : null,
              seg.fade !== undefined ? { color: withAlpha(color, seg.fade) } : null,
              seg.band
                ? {
                    textDecorationLine: 'underline',
                    textDecorationColor: withAlpha(colors.accent, 0.4),
                  }
                : null,
              seg.tie
                ? { textDecorationLine: 'underline', textDecorationColor: colors.accent }
                : null,
            ]}
          >
            {seg.text}
          </Text>
        ))}
        {lens === 'melody' && marks?.linked === true ? (
          <Text style={{ color: colors.accent }}>‿</Text>
        ) : null}
        {groupEnd === null ? (
          trailing
        ) : (
          <>
            {punctuation}
            <Text style={{ color: colors.warning, fontFamily: medium }}> {groupEnd}</Text>
            {space}
          </>
        )}
      </Text>
    </View>
  );
}

/**
 * A passage with one lens of its pronunciation drawn on it (plan 86, §4i.2).
 *
 * The text is never altered: every character of `text` is shown once and in order. With no
 * lens this is one plain `Text`, so a learner who stays on «Meaning» gets the ordinary reader.
 */
export function ProsodyText({
  text,
  layer,
  sounds = [],
  lens,
  tokenOffset = 0,
  fontSize,
  color,
  style,
}: ProsodyTextProps) {
  const base: TextStyle = {
    fontFamily: typography.body.fontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * WORD_LINE),
    color,
  };
  if (lens === null) return <Text style={[base, style]}>{text}</Text>;

  const chunks: Chunk[] = chunksOf(text, layer, sounds, tokenOffset);
  const elements: React.ReactNode[] = [];
  for (const chunk of chunks) {
    elements.push(
      chunk.word === null ? (
        <Text key={chunk.key} style={base}>
          {chunk.trailing}
        </Text>
      ) : (
        <ProsodyWordView
          key={chunk.key}
          word={chunk.word}
          marks={chunk.marks}
          trailing={chunk.trailing}
          lens={lens}
          fontSize={fontSize}
          color={color}
        />
      ),
    );
    // A line break ends the row; each one after the first is an empty line.
    for (let b = 0; b < chunk.breaks; b++) {
      elements.push(
        <View
          key={`${chunk.key}-br${b}`}
          style={[styles.lineBreak, b > 0 ? { height: Math.round(fontSize * WORD_LINE) } : null]}
        />,
      );
    }
  }

  return (
    <View style={[styles.flow, style as StyleProp<never>]} accessibilityLabel={text}>
      {elements}
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  lineBreak: { width: '100%', height: 0 },
});
