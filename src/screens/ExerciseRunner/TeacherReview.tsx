import React from 'react';
import { Text, View } from 'react-native';
import type { AttemptRow } from '../../api/exercises';
import type { SubmissionStatus } from '../../api/submissions';
import { Card } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { criterionMarks } from '../TodayScreen/blockLogic';

export interface TeacherReviewProps {
  attempt: AttemptRow;
  status: SubmissionStatus;
  teacher: string | null;
  criteria: Map<string, string>;
}

/**
 * A teacher's verdict on a hand-in: the comment (signed when the name is known) or a plain line,
 * and an essay's marks. Shared by «My work» (`SubmissionScreen`) and the runner reopening a
 * hand-in (OQ-S3 s19).
 */
export function TeacherReview({ attempt, status, teacher, criteria }: TeacherReviewProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const comment = attempt.reviewComment?.trim() || null;
  const marks = criterionMarks(attempt.rubricMarks, criteria);

  return (
    <>
      {comment ? (
        <Card style={{ gap: 6 }}>
          <Text style={[typography.overline, { color: colors.neutral400 }]}>
            {teacher ? t('submission.commentBy', { teacher }) : t('submission.commentUnsigned')}
          </Text>
          <Text style={[typography.body, { color: colors.text }]}>{comment}</Text>
        </Card>
      ) : (
        // A pass with nothing written on it is still a person's decision, not «nobody looked».
        <Text style={[typography.body, { color: colors.neutral400 }]}>
          {status === 'approved' ? t('submission.approvedNoComment') : t('submission.returnedNoComment')}
        </Text>
      )}
      {marks ? (
        <Card variant="outline" style={{ gap: 8 }}>
          <Text style={[typography.overline, { color: colors.neutral400 }]}>{t('submission.marks')}</Text>
          {marks.map((m) => (
            <View key={m.name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[typography.secondary, { color: colors.text, flex: 1 }]}>{m.name}</Text>
              <Text style={[typography.secondary, { color: colors.neutral300 }]}>
                {t('submission.mark', { mark: m.mark })}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}
