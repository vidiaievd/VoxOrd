import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseDisplay } from '../../api/types';
import type {
  AnswerQuestionAnswer,
  AnswerQuestionResponse,
  CheckRowResponse,
  SubmitAttemptResponse,
} from '../../api/exercises';
import type { RunnerPhase } from './runnerMachine';
import { MultipleChoiceBody } from './MultipleChoiceBody';
import { FillInBlankBody } from './FillInBlankBody';
import { TranslateBody } from './TranslateBody';
import { MatchPairsBody } from './MatchPairsBody';
import { SentenceSchemaBody } from './SentenceSchemaBody';
import { ShortAnswerBody } from './ShortAnswerBody';
import { WritingTaskBody } from './WritingTaskBody';
import { MultipleChoiceGroupBody } from './MultipleChoiceGroupBody';

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
  /**
   * Hand in one question of a set that is answered a question at a time, and
   * get the server's verdict for it (`short_answer`, plan 51 §3.3;
   * `multiple_choice`, plan 53 §3.3).
   *
   * The one thing a body may do to the attempt besides describing its answer,
   * and it exists because these templates cannot be checked once. For
   * `short_answer` each answer is final the moment it is given and the phrases
   * it is matched against are the answer itself, so they never reach the
   * device. For `multiple_choice` the key is only an id — but the type is built
   * on dosing it: a second try and a 50/50 offered by a device that already
   * holds the key are decoration, so the pick goes up and `keyOptionId` comes
   * back only once the question is closed.
   *
   * It opens the attempt on first use; the footer's Check then closes that same
   * attempt with one aggregate. What the answer carries — written text, or a
   * picked option — is read on the server according to the attempt's own
   * template, which is why it travels whole rather than as a string.
   *
   * Every other body ignores it and keeps grading where it belongs: nowhere on
   * this side.
   */
  answerQuestion: (
    questionId: string,
    answer: AnswerQuestionAnswer,
  ) => Promise<AnswerQuestionResponse>;
  /**
   * Check one sentence of a `sentence_schema` set and get the server's marks for it
   * (plan 52 §3.3).
   *
   * The second thing a body may do to the attempt, and it exists for the same reason as
   * `answerQuestion`: this template cannot be checked once. Which field a piece belongs in
   * is the answer key, so the marks have to come from the server — and a sentence may be
   * checked as often as the learner likes, because being wrong is a step in solving it
   * rather than a verdict. `reveal` closes the sentence with the answer shown instead, and
   * it scores nothing.
   *
   * It opens the attempt on first use; the footer's Check then closes that same attempt
   * with every board in one aggregate. Every other body ignores it.
   */
  checkRow: (
    rowId: string,
    placement: Record<string, string[]>,
    reveal: boolean,
  ) => Promise<CheckRowResponse>;
  /**
   * Check the whole table of a `multiple_choice_group` and get the server's verdict
   * (plan 54 §8 Q6, variant D).
   *
   * The third thing a body may do to the attempt, and the first that is the submit
   * itself. This template is answered and judged as one block, and its retry is a second
   * submit onto the same attempt: the engine reopens the scored attempt, spends one of
   * the author's `retry` budget, and doses the key — which statements are wrong on every
   * pass, the right column and the author's line only once the table is closed.
   *
   * Because the check *is* the submit, there is no footer Check left to close the item
   * with. The check that closes the table is reported through `finishTable`, which is why
   * these two arrive together. Every other body ignores both and closes through the
   * footer as before.
   */
  checkTable: (
    answers: Record<string, string>,
    reveal: boolean,
  ) => Promise<SubmitAttemptResponse>;
  /** Record the check that closed the table; the runner moves to feedback. */
  finishTable: (verdict: SubmitAttemptResponse) => void;
  /**
   * Leave the runner for the lesson this exercise was set on — `multiple_choice_group`'s
   * «To the text» in `link` mode (plan 54 Q5).
   *
   * Absent unless the screen that opened the runner knew of one: the exercise itself
   * carries no lesson id, and the unit is what says which text its exercises are about.
   * Every other body ignores it.
   */
  onOpenSourceLesson?: () => void;
}

/**
 * Whether this template's body runs its own checks against the server and closes the item
 * itself, so the shell must not draw a Check button of its own.
 *
 * One template, and the reason is structural rather than stylistic: for
 * `multiple_choice_group` the round-by-round check and the closing submit are the same
 * call, so a footer Check under the table's own «Check answers» would either be dead or
 * be a second check the engine refuses (plan 54 §8 Q6).
 */
export function bodyOwnsCheck(templateCode: string): boolean {
  return templateCode === 'multiple_choice_group';
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
 * sentence_schema, short_answer, writing_task); everything else falls
 * through to the placeholder.
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
    case 'writing_task':
      return <WritingTaskBody {...props} />;
    case 'multiple_choice_group':
      return <MultipleChoiceGroupBody {...props} />;
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
