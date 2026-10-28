import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { latestDirectReview } from '../../../api/submissions';
import { Icon, Tag } from '../../../components/ui';
import { useMySubmissions } from '../../../hooks/useMySubmissions';
import { useTranslation } from '../../../i18n';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { statusTag } from '../blockLogic';
import { useRegisterRefresh } from '../refresh';

interface AiReviewedProps {
  onNavigate: (screen: Screen) => void;
}

/**
 * Block 6b (D): the latest work a model reviewed on its own (`review_direct`, plan 79) within
 * two weeks — block 6's card with a model's heading. «Open the review» goes to the
 * submission; «Rewrite» only on the returned row a new attempt resumes, and only when the
 * engine knows the unit it sat in (older work does not say). The screen draws the block in
 * variant D alone, which already means `ai.review_direct` or another AI key is on — a model's
 * verdict on file is the evidence that counts.
 */
export function AiReviewed({ onNavigate }: AiReviewedProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { submissions, refresh } = useMySubmissions();
  useRegisterRefresh(refresh);

  const latest = submissions ? latestDirectReview(submissions.items) : null;
  if (!latest) return null;

  const tag = statusTag(latest.status);
  const comment = latest.decision?.comment ?? null;
  const title = latest.title ?? t('submission.fallbackTitle');
  const rewrite =
    latest.canResubmit && latest.unitId && latest.containerId
      ? { unitId: latest.unitId, courseId: latest.containerId }
      : null;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        padding: spacing.cardPadding,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="Sparkle" size={18} color={colors.neutral400} />
        <Text style={[typography.overline, { color: colors.neutral400, flex: 1 }]}>
          {t('today.aiReviewed.title')}
        </Text>
        <Tag label={t(tag.key)} variant={tag.variant} />
      </View>
      <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      {comment ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]} numberOfLines={2}>
          {comment}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('today.aiReviewed.open')}: ${title}`}
          hitSlop={{ top: 8, bottom: 8 }}
          onPress={() =>
            onNavigate({
              name: 'Submission',
              submissionId: latest.attemptId,
              exerciseId: latest.exerciseId,
              returnTo: { name: 'Today' },
            })
          }
        >
          <Text style={[typography.secondary, { color: colors.accent300 }]}>{t('today.aiReviewed.open')}</Text>
        </Pressable>
        {rewrite ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('today.aiReviewed.rewrite')}: ${title}`}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() =>
              // The exercise alone: Back from the runner lands on its unit.
              onNavigate({
                name: 'ExerciseRunner',
                exerciseIds: [latest.exerciseId],
                startIndex: 0,
                unitId: rewrite.unitId,
                courseId: rewrite.courseId,
              })
            }
          >
            <Text style={[typography.secondary, { color: colors.accent300 }]}>
              {t('today.aiReviewed.rewrite')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
