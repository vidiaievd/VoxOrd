import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { criterionNames } from '../../api/aiReview';
import type { AttemptRow } from '../../api/exercises';
import type { ExerciseDisplay } from '../../api/types';
import { Card, Tag } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { AiVerdict } from './AiVerdict';
import { TeacherReview } from './TeacherReview';
import { handedInLines, handedInState } from './templates/handedIn';

interface HandedInWorkProps {
  display: ExerciseDisplay;
  attempt: AttemptRow;
  /** Kept on the phone, not on the server yet. */
  onPhone: boolean;
}

/**
 * Work handed in on an earlier visit, shown again in place of a fresh attempt (OQ-S3 s19; the
 * web's «sent» view of each solver). The work as it was sent, then whoever has read it: a
 * teacher's verdict, or a model's — final for a learner on their own, provisional at a school
 * that has a model read first. Work still waiting says so in the runner's footer, as after a
 * hand-in on this screen; the model's provisional verdict is drawn under this card by the runner.
 */
export function HandedInWork({ display, attempt, onPhone }: HandedInWorkProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const lines = useMemo(
    () => handedInLines(display.templateCode, display.content, attempt.submittedAnswer),
    [display.templateCode, display.content, attempt.submittedAnswer],
  );
  const state = handedInState(attempt, onPhone);

  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[typography.resumeTitle, { color: colors.text }]}>
        {t('exerciseRunner.handedIn.title')}
      </Text>

      {lines.length > 0 ? (
        <Card variant="outline" style={{ gap: 12 }}>
          {lines.map(line => (
            <View key={line.key} style={{ gap: 4 }}>
              {line.prompt ? (
                <Text style={[typography.secondary, { color: colors.neutral400 }]}>{line.prompt}</Text>
              ) : null}
              <Text style={[typography.body, { color: colors.text }]}>{line.text}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {state.kind === 'reviewed' && state.by === 'teacher' ? (
        <View style={{ gap: 10 }}>
          <Tag
            label={t(state.passed ? 'today.status.passed' : 'today.status.rewrite')}
            variant={state.passed ? 'accent' : 'outline'}
          />
          <TeacherReview
            attempt={attempt}
            status={state.passed ? 'approved' : 'returned'}
            teacher={null}
            criteria={criterionNames(attempt.rubricSnapshot)}
          />
        </View>
      ) : null}

      {/* A model's own verdict, already given: the wait settles on its first look. */}
      {state.kind === 'reviewed' && state.by === 'ai' ? (
        <AiVerdict exerciseId={display.id} attemptId={attempt.id} templateCode={display.templateCode} />
      ) : null}

      {state.kind === 'autoPassed' ? (
        <Tag label={t('today.status.passed')} variant="accent" />
      ) : null}
    </View>
  );
}
