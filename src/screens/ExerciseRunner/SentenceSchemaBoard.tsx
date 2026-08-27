import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type {
  FieldMark,
  ItemMark,
  Placement,
  SentenceSchemaField,
  SentenceSchemaItem,
} from './templates/sentenceSchema';

/** The marks, once the sentence has been checked. Cleared by any placement. */
export interface BoardMarks {
  byItem: Record<string, ItemMark>;
  /** Null when the author turned per-field marking off — the verdict still stands. */
  byField: Record<string, FieldMark> | null;
}

export interface SchemaBoardProps {
  fields: SentenceSchemaField[];
  placement: Placement;
  /** The text of a piece, by id. */
  textOf: (itemId: string) => string;
  labels: boolean;
  hints: boolean;
  /** Expected chunks per field, when the author turned counts on. */
  counts: Record<string, number> | null;
  marks: BoardMarks | null;
  /** The field waiting for a piece, in the tap-a-field-then-tap-a-word path. */
  selectedField: string | null;
  onFieldPress: (fieldId: string) => void;
  /** Take a piece back to the bank. */
  onRemove: (itemId: string) => void;
  /** Nothing accepts input: the sentence is solved or revealed. */
  readOnly: boolean;
}

/**
 * The topological field board, in the phone's layout.
 *
 * Only the **rows** layout is built (plan 52, phase 6): the field key beside its cell, one
 * field per line. The web has a second, columns layout — the fields side by side, which is
 * the picture the model is *about* — but it needs ~104px per field plus gaps, so a
 * four-field schema wants 434px and a seven-field one 764px. No phone has that, and the
 * web's own `fitsAsColumns` would answer "rows" on every one of them. Building a layout
 * that could never be chosen is not parity.
 *
 * Three things here look like styling and are not:
 *
 * - **An empty field draws `—` only when it may legitimately stay empty.** A required
 *   field left empty draws nothing at all, so that its emptiness is not a hint that
 *   something belongs there (BEHAVIOR, "Empty and edge states").
 * - **A cell stays dashed until the sentence is marked.** The dashed edge is what says
 *   "this is a slot"; turning it solid the moment a word lands makes quiet outlines into
 *   boxes, which is the difference between reading a chart and filling in a form.
 * - **A nameless field draws no head at all.** That is the sequence-only slot: asked for
 *   word order, a learner must not be reading a field name, and an empty head would leave
 *   a gap where the name used to be.
 */
export function SchemaBoard({
  fields,
  placement,
  textOf,
  labels,
  hints,
  counts,
  marks,
  selectedField,
  onFieldPress,
  onRemove,
  readOnly,
}: SchemaBoardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.board}>
      {fields.map((field) => {
        const ids = placement[field.id] ?? [];
        const fieldMark = marks?.byField?.[field.id];
        const tone =
          fieldMark === undefined || fieldMark === 'empty'
            ? null
            : fieldMark === 'ok'
              ? { bg: 'rgba(52, 199, 89, 0.10)', line: colors.success }
              : { bg: 'rgba(255, 59, 48, 0.08)', line: colors.danger };
        const armed = selectedField === field.id;
        const named = field.short !== '' || (labels && field.label !== '');
        // Dashed until the sentence is marked, filled or not. The dashed edge is what says
        // "this is a slot"; turning it solid the moment a word lands makes quiet outlines
        // into boxes.
        const edge: 'dashed' | 'solid' = tone === null ? 'dashed' : 'solid';

        return (
          <View key={field.id} style={styles.field}>
            <View style={styles.row}>
              {named ? (
                <View style={styles.head}>
                  <Text style={styles.short}>{field.short}</Text>
                  {labels && field.label !== '' ? (
                    <Text style={styles.label} numberOfLines={2}>
                      {field.label}
                    </Text>
                  ) : null}
                  {counts?.[field.id] !== undefined ? (
                    <Text style={styles.count}>{counts[field.id]}</Text>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.cell,
                  named ? null : styles.cellWide,
                  {
                    borderStyle: edge,
                    borderColor: tone?.line ?? (armed ? colors.accent : colors.textMuted),
                    backgroundColor:
                      tone?.bg ?? (armed ? colors.accentLight : colors.backgroundCard),
                  },
                ]}
                onPress={() => onFieldPress(field.id)}
                disabled={readOnly}
                accessibilityRole={readOnly ? undefined : 'button'}
                accessibilityLabel={
                  readOnly
                    ? undefined
                    : t('exerciseRunner.sentenceSchema.fieldDropLabel', {
                        field: field.label || field.short || t('exerciseRunner.sentenceSchema.slot'),
                      })
                }
                accessibilityState={{ selected: armed }}
                activeOpacity={0.75}
              >
                {ids.length === 0
                  ? // Only an optional field says it is meant to be empty. A required one
                    // stays blank, so its emptiness cannot be read as a clue.
                    field.optional && <Text style={styles.empty}>—</Text>
                  : ids.map((itemId) => {
                      const itemMark = marks?.byItem[itemId];
                      const wrong = itemMark !== undefined && itemMark !== 'ok';
                      return (
                        <TouchableOpacity
                          key={itemId}
                          style={[
                            styles.chip,
                            wrong
                              ? styles.chipWrong
                              : itemMark === 'ok'
                                ? styles.chipRight
                                : null,
                          ]}
                          onPress={() => onRemove(itemId)}
                          disabled={readOnly}
                          accessibilityRole={readOnly ? undefined : 'button'}
                          accessibilityLabel={
                            readOnly
                              ? undefined
                              : t('exerciseRunner.sentenceSchema.takeBack', {
                                  word: textOf(itemId),
                                })
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wrong
                                ? styles.chipTextWrong
                                : itemMark === 'ok'
                                  ? styles.chipTextRight
                                  : null,
                            ]}
                          >
                            {textOf(itemId)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
              </TouchableOpacity>
            </View>

            {/* The author's one-line explanation takes the line below, across the whole
                field: in the 96px key column a sentence wraps to three lines and doubles
                the height of every field on the board. The handoff has no answer here —
                its own default is `hints: false` and its rows grid is written for exactly
                two children — so this is the missing case rather than a departure. */}
            {named && hints && field.hint !== '' ? (
              <Text style={styles.hint}>{field.hint}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export interface WordBankProps {
  /** The pieces of this sentence, in the order the server shuffled them into. */
  items: SentenceSchemaItem[];
  /** Ids currently on the board — drawn in place, faded, still tappable to take back. */
  used: string[];
  /** The piece waiting for a field. */
  selected: string | null;
  onPress: (itemId: string) => void;
  interactive: boolean;
}

/**
 * The bank of pieces, and one rule that is easy to get wrong: **a used piece stays where
 * it was**, faded, rather than leaving the bank.
 *
 * Removing it reflows everything after it, which destroys the spatial memory the learner
 * has been building for the last four placements — and mid-sentence that is the thing they
 * were relying on. `match_pairs` settled this the same way. The count of what is left
 * carries the "how much is there still to do" signal instead.
 *
 * Nothing here reorders anything: a bank in sentence order is the answer in order, and a
 * client that arranged it would be arranging something the server had already sent.
 */
export function WordBank({ items, used, selected, onPress, interactive }: WordBankProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const left = items.length - used.length;

  return (
    <View style={styles.bank}>
      <View style={styles.bankHead}>
        <Text style={styles.bankLabel}>{t('exerciseRunner.sentenceSchema.bankLabel')}</Text>
        <Text style={styles.bankLeft}>
          {t('exerciseRunner.sentenceSchema.remaining', { count: left })}
        </Text>
      </View>
      <View style={styles.bankWords}>
        {items.map((item) => {
          const isUsed = used.includes(item.id);
          const armed = selected === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.word, armed ? styles.wordArmed : null, isUsed ? styles.wordUsed : null]}
              onPress={() => onPress(item.id)}
              disabled={!interactive}
              accessibilityRole="button"
              accessibilityState={{ selected: armed, disabled: !interactive }}
              // Exposed, not implied: the fade says nothing to a screen reader, and these
              // pieces are the exercise. Not `disabled` — a placed piece is still the way
              // to take it back off the board, so announcing it as refused would be a lie.
              accessibilityHint={
                isUsed ? t('exerciseRunner.sentenceSchema.takeBack', { word: item.text }) : undefined
              }
            >
              <Text style={[styles.wordText, armed ? styles.wordTextArmed : null]}>
                {item.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** The tap target floor, from the handoff. */
const TAP_MIN = 44;

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    board: {
      gap: 8,
    },
    field: {
      gap: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    head: {
      width: 96,
      flexShrink: 0,
    },
    short: {
      fontFamily: 'monospace',
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    label: {
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
    },
    count: {
      fontFamily: 'monospace',
      fontSize: 10,
      color: colors.textMuted,
    },
    cell: {
      flex: 1,
      minHeight: TAP_MIN,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      borderRadius: 10,
      borderWidth: 1.5,
      paddingHorizontal: 7,
      paddingVertical: 7,
    },
    cellWide: {
      // The sequence-only slot holds the whole sentence and has no key beside it.
      minHeight: 72,
      alignContent: 'flex-start',
    },
    empty: {
      marginHorizontal: 'auto',
      fontSize: 13,
      color: colors.textMuted,
    },
    chip: {
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: colors.accentLight,
    },
    chipRight: {
      backgroundColor: 'rgba(52, 199, 89, 0.14)',
    },
    chipWrong: {
      backgroundColor: 'rgba(255, 59, 48, 0.12)',
      // Never colour alone: a wrong piece is boxed as well as tinted.
      borderWidth: 1,
      borderColor: colors.danger,
    },
    chipText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    chipTextRight: {
      color: colors.success,
      fontWeight: '600',
    },
    chipTextWrong: {
      color: colors.danger,
      fontWeight: '600',
    },
    hint: {
      fontSize: 10.5,
      lineHeight: 14,
      color: colors.textMuted,
    },
    bank: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      gap: 9,
    },
    bankHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    bankLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    bankLeft: {
      fontSize: 12,
      color: colors.textMuted,
    },
    bankWords: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    word: {
      minHeight: TAP_MIN,
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    wordArmed: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    wordUsed: {
      opacity: 0.3,
    },
    wordText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    wordTextArmed: {
      color: colors.textInverted,
      fontWeight: '600',
    },
  });
