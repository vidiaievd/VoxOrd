import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import type { LessonParagraph } from '../../api/types';
import type { ReaderGlossaryEntry } from '../../api/lessons';
import { tokenizeGlossary } from '../../utils/tokenizeGlossary';

interface ParagraphViewProps {
  paragraph: LessonParagraph;
  glossaryIndex: Map<string, ReaderGlossaryEntry>;
}

export function ParagraphView({ paragraph, glossaryIndex }: ParagraphViewProps) {
  const { colors } = useTheme();
  const { show } = useModal();
  const styles = makeStyles(colors);
  const [showTranslation, setShowTranslation] = useState(false);

  const tokens = useMemo(
    () => tokenizeGlossary(paragraph.target, glossaryIndex),
    [paragraph.target, glossaryIndex],
  );

  return (
    <View style={styles.block}>
      <Text style={styles.target}>
        {tokens.map((token, i) =>
          token.entry ? (
            <Text
              key={i}
              style={styles.glossaryWord}
              onPress={() => show({ type: 'glossary', entry: token.entry! })}
            >
              {token.text}
            </Text>
          ) : (
            <Text key={i}>{token.text}</Text>
          ),
        )}
      </Text>

      {paragraph.translation && (
        <>
          <TouchableOpacity onPress={() => setShowTranslation((v) => !v)}>
            <Text style={styles.toggle}>{showTranslation ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
          {showTranslation && <Text style={styles.translation}>{paragraph.translation}</Text>}
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    block: {
      marginBottom: 16,
    },
    target: {
      fontSize: 17,
      lineHeight: 26,
      color: colors.textPrimary,
    },
    glossaryWord: {
      color: colors.accent,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    toggle: {
      fontSize: 16,
      marginTop: 6,
    },
    translation: {
      marginTop: 4,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
  });
