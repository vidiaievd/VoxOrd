import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import type { CourseMastery } from '../../api/types';

interface CourseStatsSectionProps {
  mastery: CourseMastery;
  srsDueCount: number;
}

const SKILL_LABEL_KEYS = {
  vocabulary: 'skillVocabulary',
  grammar: 'skillGrammar',
  reading: 'skillReading',
  listening: 'skillListening',
  speaking: 'skillSpeaking',
  writing: 'skillWriting',
} as const;

/**
 * Mastery bars + reviews-due counter (display only, Phase 6). `srsDueCount`
 * is the user's total due count across all content, not scoped to this
 * course — see the caveat in `src/api/courseHome.ts` — so this renders as a
 * general reviews-due stat, not "due in this course".
 */
export function CourseStatsSection({ mastery, srsDueCount }: CourseStatsSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  if (mastery.bySkill.length === 0 && srsDueCount === 0) return null;

  return (
    <View style={styles.container}>
      {mastery.bySkill.length > 0 && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>{t('courseHome.mastery')}</Text>
            <Text style={styles.overallPercent}>{mastery.overallMastery}%</Text>
          </View>

          {mastery.bySkill.map((skill) => {
            const labelKey = SKILL_LABEL_KEYS[skill.skill as keyof typeof SKILL_LABEL_KEYS];
            return (
              <View key={skill.skill} style={styles.skillRow}>
                <Text style={styles.skillLabel}>{labelKey ? t(`courseHome.${labelKey}`) : skill.skill}</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${skill.masteryPercent}%` }]} />
                </View>
                <Text style={styles.skillPercent}>{skill.masteryPercent}%</Text>
              </View>
            );
          })}
        </>
      )}

      {srsDueCount > 0 && (
        <Text style={styles.reviewsDue}>{t('courseHome.reviewsDue', { count: srsDueCount })}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    overallPercent: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
    },
    skillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    skillLabel: {
      width: 84,
      fontSize: 12,
      color: colors.textMuted,
    },
    barBg: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginHorizontal: 8,
    },
    barFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    skillPercent: {
      width: 32,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'right',
    },
    reviewsDue: {
      marginTop: 10,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
