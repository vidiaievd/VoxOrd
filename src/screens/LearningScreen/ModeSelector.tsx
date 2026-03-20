import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { Deck } from '../../repositories/DeckRepository';
import { useDeepSessionCooldown } from '../../hooks/useDeepSessionCooldown';

export interface LearningMode {
  id: string;
  icon: string;
  title: string;
  description: string;
  color: string;
  available: boolean;
}

const LEARNING_MODES: LearningMode[] = [
  {
    id: 'flashcard',
    icon: '🃏',
    title: 'Flashcards',
    description: 'Flip cards to learn words',
    color: '#6c63ff',
    available: true,
  },
  {
    id: 'matching',
    icon: '🔗',
    title: 'Matching',
    description: 'Match words with translations',
    color: '#ff9f43',
    available: true,
  },
  {
    id: 'quiz',
    icon: '⚡',
    title: 'Quick Quiz',
    description: 'Choose the correct meaning',
    color: '#ff3b30',
    available: true,
  },
  {
    id: 'spelling',
    icon: '✍️',
    title: 'Spelling',
    description: 'Type the word from translation',
    color: '#34c759',
    available: true,
  },
  {
    id: 'listening',
    icon: '🎧',
    title: 'Listening',
    description: 'Hear and select the meaning',
    color: '#5ac8fa',
    available: true,
  },
  {
    id: 'pronunciation',
    icon: '🎤',
    title: 'Pronunciation',
    description: 'Practice speaking words and phrases',
    color: '#ff6b35',
    available: true,
  },
  {
    id: 'context',
    icon: '📝',
    title: 'Context',
    description: 'Complete sentences',
    color: '#af52de',
    available: true,
  },
];

interface ModeSelectorProps {
  deck: Deck;
  onSelectMode: (modeId: string, deck: Deck) => void;
  onBack: () => void;
}

export function ModeSelector({
  deck,
  onSelectMode,
  onBack,
}: ModeSelectorProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const cooldown = useDeepSessionCooldown(deck.id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerDeck} numberOfLines={1}>
            {deck.icon} {deck.title}
          </Text>
          <Text style={styles.headerSub}>
            {deck.totalWords} words · Choose a mode
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[
            styles.deepBtn,
            cooldown.isOnCooldown && styles.deepBtnDisabled,
          ]}
          onPress={() => !cooldown.isOnCooldown && onSelectMode('deep', deck)}
          activeOpacity={cooldown.isOnCooldown ? 1 : 0.8}
        >
          <View style={styles.deepBtnLeft}>
            <Text style={styles.deepBtnIcon}>🧠</Text>
            <View>
              <Text style={styles.deepBtnTitle}>Deep Session</Text>
              {cooldown.isOnCooldown ? (
                <Text style={styles.deepBtnSub}>
                  Available in {cooldown.remainingLabel}
                </Text>
              ) : (
                <Text style={styles.deepBtnSub}>
                  Flashcard → Listening → Quiz → Spelling
                </Text>
              )}
            </View>
          </View>
          {cooldown.isOnCooldown ? (
            <Text style={styles.deepBtnCooldown}>⏳</Text>
          ) : (
            <Text style={styles.deepBtnArrow}>→</Text>
          )}
        </TouchableOpacity>

        {/* Self Assessment */}
        <TouchableOpacity
          style={styles.assessmentBtn}
          onPress={() => onSelectMode('assessment', deck)}
          activeOpacity={0.8}
        >
          <View style={styles.assessmentBtnLeft}>
            <Text style={styles.assessmentBtnIcon}>🎴</Text>
            <View>
              <Text style={styles.assessmentBtnTitle}>Self Assessment</Text>
              <Text style={styles.assessmentBtnSub}>
                Rate your knowledge · swipe to mark known/unknown
              </Text>
            </View>
          </View>
          <Text style={styles.assessmentBtnArrow}>→</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Learning modes</Text>

        {LEARNING_MODES.map(mode => (
          <TouchableOpacity
            key={mode.id}
            style={[
              styles.modeCard,
              !mode.available && styles.modeCardDisabled,
            ]}
            onPress={() => mode.available && onSelectMode(mode.id, deck)}
            activeOpacity={mode.available ? 0.75 : 1}
          >
            {/* Icon */}
            <View
              style={[styles.modeIcon, { backgroundColor: `${mode.color}18` }]}
            >
              <Text style={styles.modeIconText}>{mode.icon}</Text>
            </View>

            {/* Info */}
            <View style={styles.modeInfo}>
              <Text
                style={[
                  styles.modeTitle,
                  !mode.available && styles.modeTitleDisabled,
                ]}
              >
                {mode.title}
              </Text>
              <Text style={styles.modeDescription}>{mode.description}</Text>
            </View>

            {/* Badge */}
            {mode.available ? (
              <Text style={[styles.modeArrow, { color: mode.color }]}>→</Text>
            ) : (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{deck.learnedWords}</Text>
            <Text style={styles.statLabel}>Learned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{deck.newWords}</Text>
            <Text style={styles.statLabel}>New</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{deck.repeatWords}</Text>
            <Text style={styles.statLabel}>To repeat</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 8,
      marginRight: 8,
    },
    backText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    headerInfo: {
      flex: 1,
    },
    headerDeck: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerSub: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    scroll: {
      padding: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 16,
    },
    modeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      borderRadius: 18,
      padding: 16,
      marginBottom: 10,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 2,
    },
    modeCardDisabled: {
      opacity: 0.5,
    },
    modeIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    modeIconText: {
      fontSize: 26,
    },
    modeInfo: {
      flex: 1,
    },
    modeTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 3,
    },
    modeTitleDisabled: {
      color: colors.textMuted,
    },
    modeDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    modeArrow: {
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 8,
    },
    comingSoonBadge: {
      backgroundColor: colors.backgroundInput,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginLeft: 8,
    },
    comingSoonText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 18,
      padding: 16,
      marginTop: 12,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 2,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      height: 36,
      backgroundColor: colors.border,
    },
    deepBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.accent,
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 4,
    },
    deepBtnLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    deepBtnIcon: {
      fontSize: 28,
      marginRight: 12,
    },
    deepBtnTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#fff',
      marginBottom: 2,
    },
    deepBtnSub: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.75)',
    },
    deepBtnArrow: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
      marginLeft: 8,
    },
    assessmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundCard,
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
      borderWidth: 2,
      borderColor: colors.accent,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    assessmentBtnLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    assessmentBtnIcon: {
      fontSize: 28,
      marginRight: 12,
    },
    assessmentBtnTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    assessmentBtnSub: {
      fontSize: 12,
      color: colors.textMuted,
    },
    assessmentBtnArrow: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.accent,
      marginLeft: 8,
    },
    deepBtnDisabled: {
      backgroundColor: colors.backgroundCard,
      borderWidth: 2,
      borderColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    deepBtnCooldown: {
      fontSize: 20,
      marginLeft: 8,
    },
  });
