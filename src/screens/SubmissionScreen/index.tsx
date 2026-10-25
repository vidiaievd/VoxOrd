import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { criterionNames } from '../../api/aiReview';
import { getAttempt, type AttemptRow } from '../../api/exercises';
import type { SubmissionStatus } from '../../api/submissions';
import { Card, NavHeader, Tag } from '../../components/ui';
import { useMySubmissions } from '../../hooks/useMySubmissions';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { AiReviewPanel } from '../ExerciseRunner/AiReviewPanel';
import { criterionMarks, statusTag } from '../TodayScreen/blockLogic';

interface SubmissionScreenProps {
  submissionId: string;
  exerciseId: string;
  /** What the arrow is labelled with: the screen Back returns to. */
  parentLabel: string;
  onBack: () => void;
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; attempt: AttemptRow };

/** The engine's status as the list names it. */
function statusOf(attempt: AttemptRow): SubmissionStatus {
  if (attempt.status === 'RETURNED') return 'returned';
  if (attempt.status === 'SCORED') return 'approved';
  return 'pending';
}

/**
 * One piece of work handed to a reviewer (Home spec §6.2, block 6 → `Submission`). A model's
 * review is shown whole by the runner's `AiReviewPanel`, under its label; a teacher's is the
 * status, the comment and — for an essay — the marks. The title and the teacher's name come
 * from the submissions list Today has cached; the attempt itself carries neither.
 */
export function SubmissionScreen({ submissionId, exerciseId, parentLabel, onBack }: SubmissionScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { submissions } = useMySubmissions();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setLoad({ kind: 'loading' });
    getAttempt(exerciseId, submissionId).then(
      (attempt) => live && setLoad({ kind: 'loaded', attempt }),
      () => live && setLoad({ kind: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [exerciseId, submissionId]);

  const entry = submissions?.items.find((s) => s.attemptId === submissionId) ?? null;
  const title = entry?.title ?? t('submission.fallbackTitle');

  const renderBody = () => {
    if (load.kind === 'loading') return <ActivityIndicator color={colors.accentBase} />;
    if (load.kind === 'failed') {
      return <Text style={[typography.body, { color: colors.neutral400 }]}>{t('submission.loadFailed')}</Text>;
    }
    const { attempt } = load;
    const status = statusOf(attempt);
    const byAi = (attempt.reviewedBy ?? entry?.decision?.by) === 'ai';
    const tag = statusTag(status);
    const criteria = criterionNames(attempt.rubricSnapshot);

    return (
      <>
        <Tag label={t(tag.key)} variant={tag.variant} />
        {status === 'pending' ? (
          <Text style={[typography.body, { color: colors.neutral400 }]}>{t('submission.waiting')}</Text>
        ) : byAi ? (
          <AiReviewPanel
            exerciseId={exerciseId}
            attemptId={submissionId}
            templateCode={attempt.templateCode}
            criteria={criteria}
          />
        ) : (
          <TeacherReview attempt={attempt} status={status} teacher={entry?.decision?.byName ?? null} criteria={criteria} />
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader parentLabel={parentLabel} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screenGutter, paddingBottom: 24, gap: 14 }}
      >
        <Text accessibilityRole="header" style={[typography.resumeTitle, { color: colors.text }]}>
          {title}
        </Text>
        {entry?.courseTitle ? (
          <Text style={[typography.meta, { color: colors.neutral500 }]}>{entry.courseTitle}</Text>
        ) : null}
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

interface TeacherReviewProps {
  attempt: AttemptRow;
  status: SubmissionStatus;
  teacher: string | null;
  criteria: Map<string, string>;
}

function TeacherReview({ attempt, status, teacher, criteria }: TeacherReviewProps) {
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
