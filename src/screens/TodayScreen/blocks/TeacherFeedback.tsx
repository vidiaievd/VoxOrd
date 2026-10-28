import React from 'react';
import { Text, View } from 'react-native';
import { latestSchoolFeedback, type Submission } from '../../../api/submissions';
import { Icon, PressableScale, Tag } from '../../../components/ui';
import { useMySubmissions } from '../../../hooks/useMySubmissions';
import { useTranslation } from '../../../i18n';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';
import { radii, spacing } from '../../../theme/spacing';
import { statusTag } from '../blockLogic';
import { useRegisterRefresh } from '../refresh';

interface TeacherFeedbackProps {
  offline: boolean;
  /** Variant C (`ai.review_draft`): say when a model drafted the review the teacher sent. */
  showAiDrafted?: boolean;
  onNavigate: (screen: Screen) => void;
}

/**
 * Block 6: the teacher's latest review within two weeks, and how much is still waiting.
 * Shown when there is either. At a school with a model-first policy (plan 80) the latest
 * word may be a model's — waiting for the teacher, counted at the term, or given under
 * sampling — and the card says so under the quote, never passing it off as the teacher's. The waiting line names no deadline: the phone has no school's
 * response promise to quote (the web's BFF works it out), and «48 h» would be invented.
 */
export function TeacherFeedback({ offline, showAiDrafted = false, onNavigate }: TeacherFeedbackProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { submissions, refresh } = useMySubmissions();
  useRegisterRefresh(refresh);

  if (!submissions) return null;
  const latest = latestSchoolFeedback(submissions.items);
  const waiting = submissions.pendingCount;
  if (!latest && waiting === 0) return null;

  const tag = statusTag(latest ? latest.status : 'pending');
  const decision = latest?.decision ?? null;
  const aiLine = latest !== null && aiStanding(latest);
  const aiComment = latest?.provisional?.comment ?? decision?.comment ?? null;
  const quote = aiLine
    ? aiComment
      ? t('today.teacher.aiQuote', { comment: aiComment })
      : null
    : decision?.comment
      ? decision.byName
        ? `${decision.byName}: «${decision.comment}»`
        : `«${decision.comment}»`
      : null;
  const waitingText = t('today.teacher.waiting', {
    count: submissions.pendingCapped ? `${waiting}+` : waiting,
  });

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="ChatCenteredText" size={18} color={colors.neutral400} />
        <Text style={[typography.overline, { color: colors.neutral400, flex: 1 }]}>
          {t('today.teacher.title')}
        </Text>
        <Tag label={t(tag.key)} variant={tag.variant} />
      </View>
      {latest ? (
        <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {latest.title ?? t('submission.fallbackTitle')}
        </Text>
      ) : null}
      {quote ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]} numberOfLines={2}>
          {quote}
        </Text>
      ) : null}
      {aiLine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="Sparkle" size={14} color={colors.neutral500} />
          <Text style={[typography.meta, { color: colors.neutral500, flex: 1 }]}>{t(aiLine)}</Text>
        </View>
      ) : null}
      {showAiDrafted && decision?.aiDrafted ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="Sparkle" size={14} color={colors.neutral500} />
          <Text style={[typography.meta, { color: colors.neutral500, flex: 1 }]}>
            {t('today.teacher.aiDrafted')}
          </Text>
        </View>
      ) : null}
      {offline ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="CloudSlash" size={14} color={colors.neutral500} />
          <Text style={[typography.meta, { color: colors.neutral500 }]}>{t('today.teacher.offline')}</Text>
        </View>
      ) : waiting > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="HourglassMedium" size={14} color={colors.neutral500} />
          <Text style={[typography.meta, { color: colors.neutral500 }]}>{waitingText}</Text>
        </View>
      ) : null}
    </>
  );

  const frame = {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.cardPadding,
    gap: 10,
  };

  // Only waiting work: nothing to open yet.
  if (!latest) return <View style={frame}>{body}</View>;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[t('today.teacher.title'), t(tag.key), latest.title, quote, aiLine && t(aiLine)]
        .filter(Boolean)
        .join('. ')}
      onPress={() =>
        onNavigate({
          name: 'Submission',
          submissionId: latest.attemptId,
          exerciseId: latest.exerciseId,
          returnTo: { name: 'Today' },
        })
      }
      style={frame}
    >
      {body}
    </PressableScale>
  );
}

/** The line a model's word on the school's behalf carries (plan 80); false for a teacher's. */
function aiStanding(s: Submission): string | false {
  if (s.status === 'pending') return 'today.teacher.aiProvisional';
  if (s.decision?.by !== 'ai') return false;
  return s.decision.acceptedAtTerm ? 'today.teacher.aiAcceptedAtTerm' : 'today.teacher.aiVerdict';
}
