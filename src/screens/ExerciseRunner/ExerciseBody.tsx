import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseDisplay } from '../../api/types';
import type { SubmitAttemptResponse } from '../../api/exercises';
import type { RunnerPhase } from './runnerMachine';
import { MultipleChoiceBody } from './MultipleChoiceBody';
import { FillInBlankBody } from './FillInBlankBody';
import { TranslateBody } from './TranslateBody';
import { MatchPairsBody } from './MatchPairsBody';
import { SentenceSchemaBody } from './SentenceSchemaBody';
import { ShortAnswerBody } from './ShortAnswerBody';

/**
 * Contract every per-template body implements (Phase 4.2+). A body is a
 * controlled component: it reads the template-specific `content` (cast from
 * `display.content` per `templateCode`, mirroring the web reader), renders the
 * answer UI, and reports the current answer + submittability upward via
 * `onAnswerChange`. It never grades — grading is server-side.
 *
 * `disabled` is true whenever the runner is not in the 'answering' phase
 * (checking / feedback), so a body can lock its inputs while a verdict shows.
 */
export interface ExerciseBodyProps {
  display: ExerciseDisplay;
  phase: RunnerPhase;
  disabled: boolean;
  /**
   * The server's verdict once one exists (feedback phase onward), so a body
   * can highlight correctness inline (e.g. which option/blank was right) the
   * way QuizExercise/SpellingExercise do. Null while answering/checking.
   */
  verdict: SubmitAttemptResponse | null;
  /**
   * @param answer opaque, template-specific payload sent verbatim as
   *   `submittedAnswer`.
   * @param canSubmit whether the answer is complete enough to Check.
   */
  onAnswerChange: (answer: unknown, canSubmit: boolean) => void;
}

/**
 * Placeholder shown for any template without a body yet. Phase 4.1 ships the
 * runner skeleton with no template bodies; steps 4.2–4.5 replace this per
 * `templateCode`. It reports `canSubmit=false`, so the Check button stays
 * disabled for unimplemented templates.
 */
function UnsupportedTemplateBody({ display, onAnswerChange }: ExerciseBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  React.useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{t('exerciseRunner.unsupportedTemplate')}</Text>
      <Text style={styles.placeholderDesc}>
        {t('exerciseRunner.unsupportedTemplateDesc', { template: display.templateCode })}
      </Text>
    </View>
  );
}

/**
 * Dispatches to the body component for a template. Steps 4.2–4.5 add cases
 * here (multiple_choice, fill_in_blank, translate_*, match_pairs,
 * short_answer, sentence_schema, writing_task); everything else falls through
 * to the placeholder.
 */
export function ExerciseBody(props: ExerciseBodyProps) {
  switch (props.display.templateCode) {
    case 'multiple_choice':
      return <MultipleChoiceBody {...props} />;
    case 'fill_in_blank':
      return <FillInBlankBody {...props} />;
    case 'translate_to_target':
    case 'translate_from_target':
      return <TranslateBody {...props} />;
    case 'match_pairs':
      return <MatchPairsBody {...props} />;
    case 'sentence_schema':
      return <SentenceSchemaBody {...props} />;
    case 'short_answer':
      return <ShortAnswerBody {...props} />;
    // writing_task lands in step 4.5.
    default:
      return <UnsupportedTemplateBody {...props} />;
  }
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    placeholderTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    placeholderDesc: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
