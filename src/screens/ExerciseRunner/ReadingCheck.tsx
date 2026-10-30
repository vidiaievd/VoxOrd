import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { passagePieces, wordKey } from '../../kernel/read-aloud';
import type {
  AiPronunciation,
  AiReadingOp,
  AiReadingPrompt,
} from '../../api/aiReview';

type T = ReturnType<typeof useTranslation>['t'];
type Styles = ReturnType<typeof makeStyles>;

/** Below this a pronounced word is named as unclear, whatever error Azure gave it. */
const UNCLEAR_BELOW = 60;

export interface ReadingCheckProps {
  prompt: AiReadingPrompt;
  /** The share of the prompt's words it had to read, as ruled. */
  passPercent: number;
  /**
   * The passage as the screen has it today. Drawn with its own case and punctuation when it
   * still matches what was ruled; otherwise — edited since, or not at hand — the words are
   * drawn from the check itself.
   */
  passage?: string | null;
}

/**
 * The machine's check of one prompt read aloud (plan 82, step 12 — the web's `ReadingCheck`):
 * the passage with the words missed or read as others marked, the count against the pass
 * mark, what was heard, the pace where the author asks for it, and — where the plan includes
 * it — pronunciation feedback; neither of the last two changed the result.
 *
 * Draws only what the engine ruled; nothing is checked again here. A word read as another
 * keeps the passage's word underlined with what was heard after it in brackets: the phone has
 * no line above the text to put it on, as the web does.
 */
export function ReadingCheck({
  prompt,
  passPercent,
  passage = null,
}: ReadingCheckProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const kinds = new Set(prompt.ops.map(op => op.k));

  return (
    <View style={styles.col}>
      <View style={styles.head}>
        <View
          style={[styles.chip, prompt.passed ? styles.chipOk : styles.chipLow]}
        >
          <Text
            style={[
              styles.chipText,
              { color: prompt.passed ? colors.accent300 : colors.neutral300 },
            ]}
          >
            {prompt.passed ? '✓ ' : '✕ '}
            {prompt.passed
              ? t('exerciseRunner.aiReview.readingCheck.passed')
              : t('exerciseRunner.aiReview.readingCheck.notPassed')}
          </Text>
        </View>
        <Text style={styles.count}>
          {t('exerciseRunner.aiReview.readingCheck.count', {
            read: prompt.read,
            total: prompt.total,
            percent: prompt.percent,
          })}
        </Text>
        <Text style={styles.mark}>
          {t('exerciseRunner.aiReview.readingCheck.mark', { percent: passPercent })}
        </Text>
      </View>

      <Text style={styles.passage}>
        <Passage
          ops={prompt.ops}
          total={prompt.total}
          passage={passage}
          styles={styles}
        />
      </Text>

      {kinds.has('missed') || kinds.has('misread') || kinds.has('extra') ? (
        <Text style={styles.legend}>
          {kinds.has('missed') ? (
            <>
              <Text style={styles.missed}>
                {t('exerciseRunner.aiReview.readingCheck.legend.word')}
              </Text>{' '}
              {t('exerciseRunner.aiReview.readingCheck.legend.missed')}
              {'   '}
            </>
          ) : null}
          {kinds.has('misread') ? (
            <>
              <Misread
                expected={t('exerciseRunner.aiReview.readingCheck.legend.word')}
                heard={t('exerciseRunner.aiReview.readingCheck.legend.heard')}
                styles={styles}
              />{' '}
              {t('exerciseRunner.aiReview.readingCheck.legend.misread')}
              {'   '}
            </>
          ) : null}
          {kinds.has('extra') ? (
            <>
              <Text style={styles.extra}>
                +{t('exerciseRunner.aiReview.readingCheck.legend.heard')}
              </Text>{' '}
              {t('exerciseRunner.aiReview.readingCheck.legend.extra')}
            </>
          ) : null}
        </Text>
      ) : null}

      <Text style={styles.note}>
        <Text style={styles.bold}>
          {t('exerciseRunner.aiReview.readingCheck.heard')}
        </Text>{' '}
        {prompt.transcript.trim() === ''
          ? t('exerciseRunner.aiReview.readingCheck.nothingHeard')
          : prompt.transcript}
      </Text>

      {prompt.wordsPerMinute !== null ? (
        <Text style={styles.note}>
          {t('exerciseRunner.aiReview.readingCheck.pace', {
            wpm: Math.round(prompt.wordsPerMinute),
          })}
        </Text>
      ) : null}

      {prompt.pronunciation !== null ? (
        <Pronunciation t={t} styles={styles} scores={prompt.pronunciation} />
      ) : null}
    </View>
  );
}

/**
 * The passage with the check laid over it. Each passage word is found by its index in the
 * ops; words heard that are not in the passage sit after the word they were heard behind.
 */
function Passage({
  ops,
  total,
  passage,
  styles,
}: {
  ops: readonly AiReadingOp[];
  total: number;
  passage: string | null;
  styles: Styles;
}) {
  const pieces = passage === null ? null : passagePieces(passage);
  const words = pieces?.filter(piece => piece.word !== undefined) ?? [];

  if (
    pieces === null ||
    !matches(
      words.map(w => w.word!),
      ops,
      total,
    )
  ) {
    return <OpsOnly ops={ops} styles={styles} />;
  }

  // What happened to each passage word, and what was heard after it.
  const status = new Map<number, AiReadingOp>();
  const after = new Map<number, string[]>();
  const before: string[] = [];
  let last = -1;
  for (const op of ops) {
    if (op.k === 'extra') {
      if (last < 0) before.push(op.heard);
      else after.set(last, [...(after.get(last) ?? []), op.heard]);
      continue;
    }
    status.set(op.i, op);
    last = op.k === 'read' ? op.i + op.n - 1 : op.i;
  }

  // The passage word index of each piece; -1 for what stands between words.
  const indices: number[] = [];
  let next = 0;
  for (const piece of pieces)
    indices.push(piece.word === undefined ? -1 : next++);

  return (
    <>
      {before.map((heard, i) => (
        <React.Fragment key={`b${i}`}>
          <Text style={styles.extra}>+{heard}</Text>{' '}
        </React.Fragment>
      ))}
      {pieces.map((piece, at) => {
        const index = indices[at]!;
        if (index < 0) return <Text key={at}>{piece.text}</Text>;
        const op = status.get(index);
        const extras = after.get(index) ?? [];
        return (
          <React.Fragment key={at}>
            {op?.k === 'missed' ? (
              <Text style={styles.missed}>{piece.text}</Text>
            ) : op?.k === 'misread' ? (
              <Misread expected={piece.text} heard={op.heard} styles={styles} />
            ) : (
              <Text
                style={
                  op !== undefined && 'focus' in op && op.focus
                    ? styles.bold
                    : undefined
                }
              >
                {piece.text}
              </Text>
            )}
            {extras.map((heard, i) => (
              <React.Fragment key={i}>
                {' '}
                <Text style={styles.extra}>+{heard}</Text>
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}

/** The passage words of today's text are the words the check was made over. */
function matches(
  words: readonly string[],
  ops: readonly AiReadingOp[],
  total: number,
): boolean {
  if (words.length !== total) return false;
  return ops.every(
    op =>
      op.k === 'extra' ||
      op.k === 'read' ||
      (words[op.i] !== undefined &&
        wordKey(words[op.i]!) === wordKey(op.expected)),
  );
}

/** Without the passage: the words as the check holds them, in its order. */
function OpsOnly({
  ops,
  styles,
}: {
  ops: readonly AiReadingOp[];
  styles: Styles;
}) {
  return (
    <>
      {ops.map((op, i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          {op.k === 'read' ? (
            <Text style={op.focus ? styles.bold : undefined}>{op.heard}</Text>
          ) : op.k === 'missed' ? (
            <Text style={styles.missed}>{op.expected}</Text>
          ) : op.k === 'misread' ? (
            <Misread expected={op.expected} heard={op.heard} styles={styles} />
          ) : (
            <Text style={styles.extra}>+{op.heard}</Text>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function Misread({
  expected,
  heard,
  styles,
}: {
  expected: string;
  heard: string;
  styles: Styles;
}) {
  return (
    <Text>
      <Text style={styles.misread}>{expected}</Text>
      <Text style={styles.heard}> ({heard})</Text>
    </Text>
  );
}

/** Azure's scores and the words it found unclear — a hint, said to be one. */
function Pronunciation({
  t,
  styles,
  scores,
}: {
  t: T;
  styles: Styles;
  scores: AiPronunciation;
}) {
  const unclear = scores.words.filter(
    w =>
      w.error === 'mispronunciation' ||
      (w.error === 'none' && w.accuracy < UNCLEAR_BELOW),
  );
  return (
    <View style={styles.pronunciation}>
      <Text style={styles.note}>
        <Text style={styles.bold}>
          {t('exerciseRunner.aiReview.readingCheck.pronunciation.title')}
        </Text>{' '}
        {t('exerciseRunner.aiReview.readingCheck.pronunciation.scores', {
          accuracy: Math.round(scores.accuracy),
          fluency: Math.round(scores.fluency),
          completeness: Math.round(scores.completeness),
        })}
        {scores.prosody !== null
          ? ` · ${t('exerciseRunner.aiReview.readingCheck.pronunciation.prosody', {
              prosody: Math.round(scores.prosody),
            })}`
          : ''}
      </Text>
      {unclear.length > 0 ? (
        <Text style={styles.note}>
          {t('exerciseRunner.aiReview.readingCheck.pronunciation.unclear')}{' '}
          {unclear.map(w => w.text).join(', ')}
        </Text>
      ) : null}
      <Text style={styles.legend}>
        {t('exerciseRunner.aiReview.readingCheck.pronunciation.note')}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    col: { gap: 8 },
    head: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 8,
      rowGap: 4,
    },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    chipOk: { backgroundColor: `${colors.accentBase}1F` },
    chipLow: { backgroundColor: `${colors.accent700}1F` },
    chipText: { fontSize: 12, fontWeight: '500' },
    count: {
      fontSize: 13,
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    mark: {
      fontSize: 13,
      color: colors.neutral500,
      fontVariant: ['tabular-nums'],
    },
    passage: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text,
    },
    bold: { fontWeight: '500' },
    missed: {
      textDecorationLine: 'line-through',
      color: colors.neutral300,
      backgroundColor: `${colors.accent700}1F`,
    },
    misread: {
      textDecorationLine: 'underline',
      textDecorationColor: colors.accent700,
    },
    heard: {
      fontSize: 12,
      color: colors.neutral300,
    },
    extra: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.neutral500,
    },
    legend: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.neutral500,
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.neutral400,
    },
    pronunciation: {
      gap: 2,
      borderRadius: 10,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
  });
