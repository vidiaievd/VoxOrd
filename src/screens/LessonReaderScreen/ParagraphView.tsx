import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import type { LessonParagraph } from '../../api/types';
import type { ReaderGlossaryEntry } from '../../api/lessons';
import { getMediaAsset } from '../../api/media';
import { tokenizeGlossary } from '../../utils/tokenizeGlossary';
import { sentenceAt, wordRuns } from '../../lib/text/wordRuns';
import type { WordCaptureSource } from '../../api/personalVocabulary';
import {
  ReaderCaptureContext,
  ReaderTextStyleContext,
  useReaderCapture,
  useReaderTextStyle,
  type ReaderCapture,
  type ReaderTextStyle,
} from './captureContext';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { readerBlocks, type Inline, type ReaderBlock } from '../../lib/text/readerBlocks';

interface ParagraphViewProps {
  paragraph: LessonParagraph;
  /** Position of the paragraph in the text — where a word saved from it was met. */
  paragraphIndex: number;
  glossaryIndex: Map<string, ReaderGlossaryEntry>;
  /** Size in points and colour by narration progress. */
  textStyle: ReaderTextStyle;
}

/**
 * One paragraph of a text lesson, drawn from the blocks its Markdown holds — dialogue turns,
 * a quoted document, lists, a table, an image — with the glossary's words tappable inside
 * every run of text, and the paragraph's translation behind the eye.
 */
export function ParagraphView({
  paragraph,
  paragraphIndex,
  glossaryIndex,
  textStyle,
}: ParagraphViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors, textStyle);
  const [showTranslation, setShowTranslation] = useState(false);
  const blocks = useMemo(() => readerBlocks(paragraph.target), [paragraph.target]);
  const textCapture = useReaderCapture();
  const capture = useMemo<ReaderCapture | null>(
    () => (textCapture ? { ...textCapture, paragraphIndex } : null),
    [textCapture, paragraphIndex],
  );

  // A paragraph that held only media the reader plays elsewhere — the narration's token.
  if (blocks.length === 0) return null;

  return (
    <ReaderCaptureContext.Provider value={capture}>
      <ReaderTextStyleContext.Provider value={textStyle}>
      <View style={styles.paragraph}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} glossaryIndex={glossaryIndex} />
        ))}

        {paragraph.translation && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showTranslation ? t('lessonReader.hideTranslation') : t('lessonReader.showTranslation')
              }
              accessibilityState={{ expanded: showTranslation }}
              onPress={() => setShowTranslation(v => !v)}
              hitSlop={8}
              style={styles.toggle}
            >
              <Icon
                name="Translate"
                size={18}
                color={showTranslation ? colors.accent300 : colors.neutral500}
              />
            </Pressable>
            {showTranslation && <Text style={styles.translation}>{paragraph.translation}</Text>}
          </>
        )}
      </View>
      </ReaderTextStyleContext.Provider>
    </ReaderCaptureContext.Provider>
  );
}

function BlockView({
  block,
  glossaryIndex,
}: {
  block: ReaderBlock;
  glossaryIndex: Map<string, ReaderGlossaryEntry>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, useReaderTextStyle());

  switch (block.kind) {
    case 'text':
      return (
        <Text style={[styles.target, styles.gap]}>
          <Inlines inlines={block.inlines} glossaryIndex={glossaryIndex} />
        </Text>
      );

    case 'heading':
      return (
        <Text style={[styles.heading, styles.gap]}>
          <Inlines inlines={block.inlines} glossaryIndex={glossaryIndex} />
        </Text>
      );

    case 'turn': {
      const tone = speakerTone(block.speaker, colors);
      return (
        <View style={[styles.turn, styles.gap, { borderLeftColor: tone }]}>
          <Text style={[styles.speaker, { color: tone }]}>{block.speaker}</Text>
          <Text style={styles.target}>
            <Inlines inlines={block.inlines} glossaryIndex={glossaryIndex} />
          </Text>
        </View>
      );
    }

    case 'list':
      return (
        <View style={styles.gap}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.target, styles.listText]}>
                <Inlines inlines={item} glossaryIndex={glossaryIndex} />
              </Text>
            </View>
          ))}
        </View>
      );

    case 'table':
      return <TableView block={block} glossaryIndex={glossaryIndex} />;

    case 'image':
      return <LessonImage mediaId={block.mediaId} alt={block.alt} />;

    case 'document':
      return (
        <View style={[styles.document, styles.gap]}>
          {block.blocks.map((inner, i) => (
            <BlockView key={i} block={inner} glossaryIndex={glossaryIndex} />
          ))}
        </View>
      );
  }
}

/**
 * A run of text with its bold and italic. A glossary word opens its card; in a text every
 * other word opens «Add to my words» (plan 75), with the sentence it stands in.
 */
function Inlines({
  inlines,
  glossaryIndex,
}: {
  inlines: Inline[];
  glossaryIndex: Map<string, ReaderGlossaryEntry>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, useReaderTextStyle());
  const { show, config } = useModal();
  const capture = useReaderCapture();
  const blockText = useMemo(() => inlines.map((inline) => inline.text).join(''), [inlines]);

  const sourceAt = (offset: number): WordCaptureSource | null =>
    capture
      ? {
          targetLanguage: capture.targetLanguage,
          sourceVariantId: capture.variantId,
          sourceParagraph: capture.paragraphIndex,
          contextSentence: sentenceAt(blockText, offset) || null,
        }
      : null;

  let inlineStart = 0;
  return (
    <>
      {inlines.map((inline, i) => {
        const emphasis = [inline.bold && styles.bold, inline.italic && styles.italic];
        const start = inlineStart;
        inlineStart += inline.text.length;
        let tokenStart = start;
        return (
          <Text key={i} style={emphasis}>
            {tokenizeGlossary(inline.text, glossaryIndex).map((token, j) => {
              const offset = tokenStart;
              tokenStart += token.text.length;
              if (token.entry) {
                const source = sourceAt(offset);
                const selected = config?.type === 'glossary' && config.entry === token.entry;
                return (
                  <Text
                    key={j}
                    style={selected ? styles.glossaryWordSelected : styles.glossaryWord}
                    onPress={() =>
                      show({
                        type: 'glossary',
                        entry: token.entry!,
                        ...(source ? { capture: { surfaceForm: token.text, source } } : {}),
                      })
                    }
                  >
                    {token.text}
                  </Text>
                );
              }
              if (!capture) return <Text key={j}>{token.text}</Text>;
              return (
                <Text key={j}>
                  {wordRuns(token.text).map((run, k) =>
                    run.isWord ? (
                      <Text
                        key={k}
                        onPress={() => {
                          const source = sourceAt(offset + run.start);
                          if (source) show({ type: 'addWord', surfaceForm: run.text, source });
                        }}
                      >
                        {run.text}
                      </Text>
                    ) : (
                      run.text
                    ),
                  )}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </>
  );
}

/** A table, scrolled sideways when it is wider than the phone. */
function TableView({
  block,
  glossaryIndex,
}: {
  block: Extract<ReaderBlock, { kind: 'table' }>;
  glossaryIndex: Map<string, ReaderGlossaryEntry>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, useReaderTextStyle());
  const rows = block.header ? [block.header, ...block.rows] : block.rows;

  return (
    <ScrollView horizontal style={styles.gap} showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        {rows.map((row, r) => (
          <View
            key={r}
            style={[
              styles.tableRow,
              r === 0 && block.header ? styles.tableHeader : null,
              r === rows.length - 1 && styles.tableRowLast,
            ]}
          >
            {row.map((cell, c) => (
              <View key={c} style={[styles.tableCell, c === 0 && styles.tableCellFirst]}>
                <Text
                  style={[styles.cellText, r === 0 && block.header ? styles.bold : null]}
                >
                  <Inlines inlines={cell} glossaryIndex={glossaryIndex} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** An image of the text, fetched by its media id; its URL is signed and fetched on show. */
function LessonImage({ mediaId, alt }: { mediaId: string; alt: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, useReaderTextStyle());
  const [uri, setUri] = useState<string | null>(null);
  const [ratio, setRatio] = useState(16 / 9);

  useEffect(() => {
    let cancelled = false;
    getMediaAsset(mediaId)
      .then(asset => {
        if (cancelled) return;
        setUri(asset.url);
        Image.getSize(
          asset.url,
          (width, height) => {
            if (!cancelled && width > 0 && height > 0) setRatio(width / height);
          },
          () => undefined,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  return (
    <View style={styles.gap}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { aspectRatio: ratio }]}
          resizeMode="cover"
          accessibilityLabel={alt}
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder, { aspectRatio: ratio }]} />
      )}
      {alt !== '' && <Text style={styles.caption}>{alt}</Text>}
    </View>
  );
}

/** One tone per speaker, the same wherever they speak in the text. */
function speakerTone(speaker: string, colors: ColorScheme): string {
  const tones = [colors.accent, colors.success, colors.warning, '#4aa3df', '#e0609a'];
  let hash = 0;
  for (const char of speaker) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  return tones[hash % tones.length]!;
}

/** Line height that goes with a reader size: 15/24, 17/28, 20/32. */
const LINE_HEIGHT: Record<number, number> = { 15: 24, 17: 28, 20: 32 };

const makeStyles = (colors: ColorScheme, text: ReaderTextStyle) => {
  const tone = {
    plain: colors.neutral200,
    read: colors.neutral300,
    current: colors.text,
    unread: colors.neutral500,
  }[text.tone];
  return StyleSheet.create({
    paragraph: {
      marginBottom: 8,
    },
    gap: {
      marginBottom: 12,
    },
    target: {
      fontSize: text.fontSize,
      lineHeight: LINE_HEIGHT[text.fontSize] ?? Math.round(text.fontSize * 1.65),
      color: tone,
    },
    heading: {
      fontSize: text.fontSize + 3,
      lineHeight: (LINE_HEIGHT[text.fontSize] ?? 28) + 2,
      fontWeight: '700',
      color: tone === colors.neutral200 ? colors.text : tone,
    },
    bold: {
      fontWeight: '700',
    },
    italic: {
      fontStyle: 'italic',
    },
    // A dashed underline in neutral500; Android draws the line solid, as it ignores the style.
    glossaryWord: {
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
      textDecorationColor: colors.neutral500,
    },
    glossaryWordSelected: {
      backgroundColor: colors.accent800,
      color: colors.accent100,
      borderRadius: 4,
    },
    turn: {
      borderLeftWidth: 3,
      paddingLeft: 12,
    },
    speaker: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.3,
      marginBottom: 2,
    },
    listItem: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    bullet: {
      fontSize: text.fontSize,
      lineHeight: LINE_HEIGHT[text.fontSize] ?? Math.round(text.fontSize * 1.65),
      color: colors.neutral500,
      width: 18,
    },
    listText: {
      flex: 1,
    },
    document: {
      padding: 14,
      paddingBottom: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.neutral800,
      borderRadius: 10,
      overflow: 'hidden',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.neutral800,
    },
    tableRowLast: {
      borderBottomWidth: 0,
    },
    tableHeader: {
      backgroundColor: colors.surface,
    },
    tableCell: {
      width: 170,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderLeftWidth: 1,
      borderLeftColor: colors.neutral800,
    },
    tableCellFirst: {
      width: 120,
      borderLeftWidth: 0,
    },
    cellText: {
      fontSize: 15,
      lineHeight: 21,
      color: tone,
    },
    image: {
      width: '100%',
      borderRadius: 12,
    },
    imagePlaceholder: {
      backgroundColor: colors.surface,
    },
    caption: {
      marginTop: 6,
      fontSize: 13,
      color: colors.neutral500,
      textAlign: 'center',
    },
    toggle: {
      alignSelf: 'flex-start',
      marginTop: -2,
      marginBottom: 8,
    },
    translation: {
      marginBottom: 12,
      fontSize: 15,
      lineHeight: 22,
      color: colors.neutral400,
      fontStyle: 'italic',
    },
  });
};
