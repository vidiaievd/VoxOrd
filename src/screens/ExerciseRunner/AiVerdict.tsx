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
}

/**
 * Free-form work handed in with `reviewer: 'ai'` (plan 79, step 2.3d): no school, a model
 * reads it on the learner's own plan, in seconds. Waits for the verdict under the work, then
 * says it — accepted or sent back by the AI — over the review itself.
 *
 * Drawn only after a hand-in on this screen: the phone reopens free-form work as a fresh
 * attempt (a teacher's verdict is not shown on return either), so there is no «coming back»
 * to wait for. `NO_REVIEWER` after the wait is its own line — no model could read it — not
 * the «not on your plan» of a hand-in that never went to one.
 */
export function AiVerdict({ exerciseId, attemptId, templateCode }: AiVerdictProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { wait, again } = useAiVerdictWait(exerciseId, attemptId);

  if (wait === null || wait.state === 'reading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.accentBase} />
        <Text style={styles.note}>{t('exerciseRunner.aiReview.reading')}</Text>
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
