import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { criterionNames } from '../../api/aiReview';
import { useAiVerdictWait } from '../../hooks/useAiVerdictWait';
import { AiReviewPanel } from './AiReviewPanel';

interface AiVerdictProps {
  exerciseId: string;
  attemptId: string;
  templateCode: string;
  /**
   * A school's work the model reads before the teacher (plan 80; OQ-110): the wait ends at the
   * model's provisional verdict, drawn as «waiting for the teacher» — not as the AI's own mark.
   */
  aiFirst?: boolean;
}

/**
 * Free-form work handed in with `reviewer: 'ai'` (plan 79, step 2.3d): no school, a model
 * reads it on the learner's own plan, in seconds. Waits for the verdict under the work, then
 * says it — accepted or sent back by the AI — over the review itself.
 *
 * Drawn after a hand-in on this screen, and again when the learner comes back to work a model
 * already read (`HandedInWork`): the wait then settles on its first look. `NO_REVIEWER` after
 * the wait is its own line — no model could read it — not the «not on your plan» of a hand-in
 * that never went to one.
 */
export function AiVerdict({ exerciseId, attemptId, templateCode, aiFirst = false }: AiVerdictProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { wait, again } = useAiVerdictWait(exerciseId, attemptId, aiFirst);

  if (wait === null || wait.state === 'reading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.accentBase} />
        <Text style={[styles.note, styles.flex]}>
          {aiFirst ? t('exerciseRunner.aiReview.readingFirst') : t('exerciseRunner.aiReview.reading')}
        </Text>
      </View>
    );
  }

  if (wait.state === 'slow') {
    return (
      <View style={styles.block}>
        <Text style={styles.note}>{t('exerciseRunner.aiReview.slow')}</Text>
        <TouchableOpacity style={styles.againBtn} onPress={again}>
          <Text style={styles.againText}>{t('exerciseRunner.aiReview.askAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { attempt } = wait;
  if (attempt.status === 'NO_REVIEWER') {
    return (
      <View style={styles.block}>
        <Text style={[styles.title, { color: colors.neutral300 }]}>
          {t('exerciseRunner.aiReview.dropped')}
        </Text>
      </View>
    );
  }

  if (aiFirst) {
    // The teacher answered before the model's word reached this screen: theirs is the one
    // that counts, and it is in «My work», not a model's mark to draw here.
    if (attempt.status !== 'ROUTED_FOR_REVIEW' && attempt.reviewedBy !== 'ai') {
      return (
        <View style={styles.block}>
          <Text style={styles.note}>{t('exerciseRunner.aiReview.teacherAnswered')}</Text>
        </View>
      );
    }
    if (attempt.status === 'ROUTED_FOR_REVIEW') {
      const provisional = attempt.provisionalVerdict;
      const accepted = provisional?.outcome === 'approved';
      // The panel says «waiting for the teacher» and when it would count by itself.
      return (
        <View style={styles.block}>
          <Text style={[styles.title, { color: accepted ? colors.accent300 : colors.neutral400 }]}>
            {accepted
              ? t('exerciseRunner.aiReview.provisionalApproved')
              : t('exerciseRunner.aiReview.provisionalReturned')}
          </Text>
          <AiReviewPanel
            exerciseId={exerciseId}
            attemptId={attemptId}
            templateCode={templateCode}
            criteria={criterionNames(attempt.rubricSnapshot)}
          />
        </View>
      );
    }
  }

  const accepted = attempt.passed === true;
  return (
    <View style={styles.block}>
      <Text style={[styles.title, { color: accepted ? colors.accent300 : colors.neutral400 }]}>
        {accepted ? t('exerciseRunner.aiReview.approved') : t('exerciseRunner.aiReview.returned')}
      </Text>
      <AiReviewPanel
        exerciseId={exerciseId}
        attemptId={attemptId}
        templateCode={templateCode}
        criteria={criterionNames(attempt.rubricSnapshot)}
      />
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    block: {
      marginTop: 16,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
    },
    flex: {
      flex: 1,
    },
    note: {
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.neutral400,
    },
    againBtn: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingVertical: 8,
    },
    againText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.accentBase,
    },
  });
