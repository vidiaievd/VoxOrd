import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildSentenceSchemaAnswer,
  extractExpectedPlacements,
  initialPlacements,
  isFieldCorrect,
  lockedTokenIds,
  placeToken,
  poolTokenIds,
  removeToken,
  sentenceSchemaCanSubmit,
  type Placements,
  type SentenceSchemaContent,
} from './templates/sentenceSchema';

/**
 * `sentence_schema` body — place sentence tokens into topological fields
 * (Norwegian "setningsskjema"). Two independent tap gestures, no drag-and-
 * drop (simpler and more reliable on mobile): tap a pool token to select it,
 * then tap a field to place it there; tap a placed (unlocked) token to send
 * it back to the pool. `prefilled` tokens are scaffolding — shown locked,
 * never tappable.
 *
 * No per-field correctness in the submit response (only the item-level
 * `correct`/score), but PRACTICE mode's `feedback.correctAnswer` carries the
 * full expected placement, so feedback CAN highlight each field correct/wrong
 * client-side — same technique as MultipleChoiceBody/MatchPairsBody.
 */
export function SentenceSchemaBody({ display, disabled, verdict, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = display.content as unknown as SentenceSchemaContent;

  const locked = useMemo(() => lockedTokenIds(content.prefilled), [content.prefilled]);
  const [placements, setPlacements] = useState<Placements>(() =>
    initialPlacements(content.prefilled),
  );
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  useEffect(() => {
    onAnswerChange(
      buildSentenceSchemaAnswer(placements, content.fields, content.tokens),
      sentenceSchemaCanSubmit(placements, content.tokens),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements]);

  const pool = poolTokenIds(content.tokens, placements);
  const tokenText = (id: string) => content.tokens.find((tk) => tk.id === id)?.text ?? id;

  const showFeedback = disabled && verdict !== null;
  const expectedPlacements = showFeedback
    ? extractExpectedPlacements(verdict!.feedback.correctAnswer)
    : null;

  const handlePoolTokenPress = (tokenId: string) => {
    if (disabled) return;
    setSelectedTokenId((prev) => (prev === tokenId ? null : tokenId));
  };

  const handleFieldPress = (fieldId: string) => {
    if (disabled || !selectedTokenId) return;
    setPlacements((prev) => placeToken(prev, fieldId, selectedTokenId));
    setSelectedTokenId(null);
  };

  const handlePlacedTokenPress = (tokenId: string) => {
    if (disabled || locked.has(tokenId)) return;
    setPlacements((prev) => removeToken(prev, tokenId));
    if (selectedTokenId === tokenId) setSelectedTokenId(null);
  };

  const fieldStyle = (fieldId: string) => {
    if (!showFeedback) return styles.field;
    if (expectedPlacements && isFieldCorrect(expectedPlacements, fieldId, placements[fieldId] ?? [])) {
      return styles.fieldCorrect;
    }
    return styles.fieldWrong;
  };

  return (
    <View>
      {content.context ? <Text style={styles.context}>{content.context}</Text> : null}
      <Text style={styles.sentence}>{content.sentence}</Text>
      {!disabled ? <Text style={styles.hint}>{t('exerciseRunner.sentenceSchemaHint')}</Text> : null}

      <View style={styles.fields}>
        {content.fields.map((field) => (
          <TouchableOpacity
            key={field.id}
            style={fieldStyle(field.id)}
            onPress={() => handleFieldPress(field.id)}
            activeOpacity={selectedTokenId ? 0.7 : 1}
          >
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.fieldTokens}>
              {(placements[field.id] ?? []).map((tokenId) => (
                <TouchableOpacity
                  key={tokenId}
                  style={locked.has(tokenId) ? styles.tokenLocked : styles.tokenPlaced}
                  onPress={() => handlePlacedTokenPress(tokenId)}
                  disabled={disabled || locked.has(tokenId)}
                >
                  <Text style={styles.tokenText}>{tokenText(tokenId)}</Text>
                </TouchableOpacity>
              ))}
              {(placements[field.id] ?? []).length === 0 && (
                <Text style={styles.fieldEmptyHint}>—</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {pool.length > 0 && (
        <View style={styles.pool}>
          {pool.map((tokenId) => (
            <TouchableOpacity
              key={tokenId}
              style={selectedTokenId === tokenId ? styles.tokenSelected : styles.tokenPool}
              onPress={() => handlePoolTokenPress(tokenId)}
              disabled={disabled}
            >
              <Text style={styles.tokenText}>{tokenText(tokenId)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    context: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 10,
      lineHeight: 18,
    },
    sentence: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      lineHeight: 24,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 16,
    },
    fields: {
      marginBottom: 20,
    },
    field: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
      padding: 12,
      marginBottom: 8,
    },
    fieldCorrect: {
      backgroundColor: 'rgba(52, 199, 89, 0.10)',
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.success,
      padding: 12,
      marginBottom: 8,
    },
    fieldWrong: {
      backgroundColor: 'rgba(255, 59, 48, 0.08)',
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.danger,
      padding: 12,
      marginBottom: 8,
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    fieldTokens: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      minHeight: 28,
    },
    fieldEmptyHint: {
      fontSize: 14,
      color: colors.textMuted,
    },
    pool: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    tokenPool: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8,
      marginBottom: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    tokenSelected: {
      backgroundColor: colors.accentLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8,
      marginBottom: 8,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    tokenPlaced: {
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginRight: 6,
      marginBottom: 4,
    },
    tokenLocked: {
      backgroundColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginRight: 6,
      marginBottom: 4,
      opacity: 0.8,
    },
    tokenText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
