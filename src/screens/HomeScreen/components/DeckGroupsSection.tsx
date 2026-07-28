import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';
import { useTranslation } from '../../../i18n';
import type { Deck, DeckGroup } from '../../../repositories/DeckRepository';

interface DeckGroupsSectionProps {
  groups: DeckGroup[];
  onDeckPress: (deck: Deck) => void;
}

/**
 * Every deck the user has, bucketed by group — including decks imported from a
 * platform vocabulary list, which land in the "Courses" group. Without this the
 * home screen only ever surfaced a single deck via the continue-learning CTA.
 */
export function DeckGroupsSection({ groups, onDeckPress }: DeckGroupsSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  // A group with no decks is noise — the seed ships groups that may stay empty.
  const visibleGroups = groups.filter((g) => g.decks.length > 0);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('home.myDecks')}</Text>

      {visibleGroups.length === 0 ? (
        <Text style={styles.empty}>{t('deckCard.noDecksYet')}</Text>
      ) : (
        visibleGroups.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={styles.groupTitle}>
              {group.icon} {group.title}
            </Text>

            {group.decks.map((deck) => {
              const percent =
                deck.totalWords > 0
                  ? Math.round((deck.learnedWords / deck.totalWords) * 100)
                  : 0;

              return (
                <TouchableOpacity
                  key={deck.id}
                  style={styles.row}
                  onPress={() => onDeckPress(deck)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deckIcon}>{deck.icon}</Text>

                  <View style={styles.info}>
                    <Text style={styles.deckTitle} numberOfLines={1}>
                      {deck.title}
                    </Text>
                    <Text style={styles.deckMeta}>
                      {t('home.deckWords', { count: deck.totalWords })}
                      {deck.level ? ` · ${deck.level}` : ''}
                    </Text>

                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${percent}%` }]} />
                    </View>
                  </View>

                  {deck.repeatWords > 0 && (
                    <View style={styles.dueBadge}>
                      <Text style={styles.dueBadgeText}>{deck.repeatWords}</Text>
                    </View>
                  )}

                  <Text style={styles.percent}>{percent}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    empty: {
      fontSize: 14,
      color: colors.textMuted,
      paddingHorizontal: 16,
    },
    group: {
      marginBottom: 16,
    },
    groupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 8,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 2,
    },
    deckIcon: {
      fontSize: 28,
      marginRight: 12,
    },
    info: {
      flex: 1,
      marginRight: 10,
    },
    deckTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    deckMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
      marginBottom: 8,
    },
    progressBg: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
    percent: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    dueBadge: {
      backgroundColor: '#fff3e0',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginRight: 8,
    },
    dueBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ff9f43',
    },
  });
