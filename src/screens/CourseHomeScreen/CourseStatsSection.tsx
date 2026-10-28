import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { ProgressTrack } from '../../components/ui';
import type { CourseMastery } from '../../api/types';

const SKILL_LABEL_KEYS = {
  vocabulary: 'skillVocabulary',
  grammar: 'skillGrammar',
  reading: 'skillReading',
  listening: 'skillListening',
  speaking: 'skillSpeaking',
  writing: 'skillWriting',
} as const;

interface TilesProps {
  /**
   * Due words resolved against the learner's imported local decks (`useCourseReviewSets`), not
   * the raw `/srs/stats/me` total: the tile never promises a session that turns out empty.
   * Not scoped to this course (open question 14.2).
   */
  totalDue: number;
  mastery: CourseMastery;
  onReviewPress: () => void;
  onSkillsPress: () => void;
}

/** The two tiles under the course title (Courses spec §6.2, item 2). */
export function CourseTiles({ totalDue, mastery, onReviewPress, onSkillsPress }: TilesProps) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const hasSkills = mastery.bySkill.length > 0;

  const tile = {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  } as const;
  const number = { fontSize: 22, lineHeight: 28, fontFamily: typography.h1.fontFamily, color: colors.text };

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={tile}>
        <Text style={number}>{totalDue}</Text>
        <Text style={[typography.meta, { color: colors.neutral400 }]}>
          {totalDue === 0 ? t('courseHome.allReviewed') : t('courseHome.dueLabel')}
        </Text>
        {totalDue > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={onReviewPress}
            hitSlop={8}
            style={{ marginTop: 4 }}
          >
            <Text style={[typography.secondary, { color: colors.accent300 }]}>
              {t('courseHome.startReview')}
            </Text>
          </Pressable>
        )}
      </View>
      {hasSkills && (
        <View style={tile}>
          <Text style={number}>{mastery.overallMastery}%</Text>
          <Text style={[typography.meta, { color: colors.neutral400 }]}>
            {t('courseHome.masteryLabel')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSkillsPress}
            hitSlop={8}
            style={{ marginTop: 4 }}
          >
            <Text style={[typography.secondary, { color: colors.accent300 }]}>
              {t('courseHome.bySkill')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Mastery bar per skill (Courses spec §6.2, item 3). */
export function SkillsBlock({ mastery }: { mastery: CourseMastery }) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.neutral800,
        borderRadius: 14,
        padding: 14,
        gap: 8,
      }}
    >
      {mastery.bySkill.map(skill => {
        const labelKey = SKILL_LABEL_KEYS[skill.skill as keyof typeof SKILL_LABEL_KEYS];
        return (
          <View key={skill.skill} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[typography.meta, { color: colors.neutral400, width: 88 }]}>
              {labelKey ? t(`courseHome.${labelKey}`) : skill.skill}
            </Text>
            <View style={{ flex: 1 }}>
              <ProgressTrack value={skill.masteryPercent / 100} fill={colors.accent600} />
            </View>
            <Text style={[typography.meta, { color: colors.neutral400, width: 30, textAlign: 'right' }]}>
              {skill.masteryPercent}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}
