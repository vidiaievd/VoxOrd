import React from 'react';
import { Text } from 'react-native';
import { Button } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { MessageLayout } from './MessageLayout';

interface QuotaGateProps {
  reviewedToday: number;
  dailyLimit: number;
  totalDue: number;
  onFinish: () => void;
  onCarryOn: () => void;
}

/**
 * The day's quota is met (Practice §7.1, 6b). On mobile this used to be invisible: the learner
 * drilled a whole multi-phase set and every rating it produced then sat in the queue until
 * tomorrow, unsent and unmentioned. So the question is asked before the work, not after it —
 * and it is a question, because the material is already due and only the person feeling tired
 * can weigh that cost.
 *
 * Finishing is the primary action; carrying on is the quiet one. No streak, no over-quota
 * tally: in spaced repetition the extra work is paid for later.
 */
export function QuotaGate({
  reviewedToday,
  dailyLimit,
  totalDue,
  onFinish,
  onCarryOn,
}: QuotaGateProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <MessageLayout
      icon="MoonStars"
      title={t('review.quotaMetTitle')}
      footer={
        <>
          <Button block label={t('review.quotaMetFinish')} onPress={onFinish} />
          <Button
            block
            variant="ghost"
            label={t('review.quotaMetCarryOn')}
            onPress={onCarryOn}
          />
        </>
      }
    >
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.neutral400 }}>
        {t('review.quotaMetBody')}
      </Text>
      <Text style={[typography.secondary, { color: colors.neutral500 }]}>
        {t('reviewSession.todayOfLeft', {
          done: reviewedToday,
          limit: dailyLimit,
          left: totalDue,
        })}
      </Text>
    </MessageLayout>
  );
}
