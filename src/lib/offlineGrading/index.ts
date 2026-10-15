import type { SubmitAttemptResponse } from '../../api/exercises';
import type { ExerciseInstruction } from '../../api/types';
import { isMultipleChoiceDocument } from '../../screens/ExerciseRunner/templates/multipleChoice';
import { isMultipleChoiceGroupDocument } from '../../screens/ExerciseRunner/templates/multipleChoiceGroup';
import { isShortAnswerDocument } from '../../screens/ExerciseRunner/templates/shortAnswer';
import {
  judgeFillInBlank,
  judgeMultipleChoiceGroupLegacy,
  judgeMultipleChoiceLegacy,
  judgeShortAnswerLegacy,
  judgeTextOrder,
  judgeWordBankFill,
  type CheckSettings,
  type JudgeOutcome,
} from './judges';

/**
 * Grading on the phone, for when the server cannot be reached (offline plan, B5 group 1).
 *
 * Only the documents the web already grades in the browser — the same list and the same
 * shape test as `CLIENT_GRADED_TEMPLATES` / `gradedInBrowser` in ssz-platform-web's
 * `grading-side.ts`: the key of these was never a secret from the student's device. Every
 * other template is graded only by the engine, and offline it says so.
 */
const PHONE_GRADED_TEMPLATES = [
  'multiple_choice',
  'multiple_choice_group',
  'fill_in_blank',
  'short_answer',
  'word_bank_fill',
  'text_order',
] as const;

type PhoneGradedTemplate = (typeof PHONE_GRADED_TEMPLATES)[number];

export function gradedOnPhone(templateCode: string, content: unknown): boolean {
  if (!(PHONE_GRADED_TEMPLATES as readonly string[]).includes(templateCode)) return false;
  // One code, two live document shapes graded on opposite sides; the new forms dose
  // their key on the server (second try, retry budget), so they stay there.
  if (templateCode === 'short_answer') return !isShortAnswerDocument(content);
  if (templateCode === 'multiple_choice') return !isMultipleChoiceDocument(content);
  if (templateCode === 'multiple_choice_group') return !isMultipleChoiceGroupDocument(content);
  return true;
}

/**
 * Each template's `defaultCheckSettings`, as content-service's `prisma/seed.ts` writes them.
 * The engine lays the exercise's own settings over these; so does the phone.
 */
const TEMPLATE_DEFAULTS: Record<PhoneGradedTemplate, CheckSettings> = {
  multiple_choice: { allow_partial_credit: false },
  multiple_choice_group: { allow_partial_credit: true },
  fill_in_blank: { case_sensitive: false, trim_whitespace: true, allow_partial_credit: true },
  word_bank_fill: {
    case_sensitive: false,
    trim_whitespace: true,
    allow_partial_credit: true,
    unique_bank_words: true,
  },
  text_order: { allow_partial_credit: true },
  short_answer: { case_sensitive: false, trim_whitespace: true },
};

const JUDGES: Record<
  PhoneGradedTemplate,
  (submitted: unknown, expected: unknown, settings: CheckSettings) => JudgeOutcome
> = {
  multiple_choice: judgeMultipleChoiceLegacy,
  multiple_choice_group: judgeMultipleChoiceGroupLegacy,
  fill_in_blank: judgeFillInBlank,
  word_bank_fill: judgeWordBankFill,
  text_order: judgeTextOrder,
  short_answer: judgeShortAnswerLegacy,
};

/** What the download keeps of `GET /exercises/:id/answers` — the key and what frames it. */
export interface ExerciseKey {
  templateCode: string;
  expectedAnswers: unknown;
  answerCheckSettings: CheckSettings | null;
  instructions: ExerciseInstruction[] | null;
}

export function exerciseKeyCacheKey(exerciseId: string): string {
  return `exercise-key:${exerciseId}`;
}

/** The verdict id of an attempt graded on the phone; the server's replaces it later. */
export const OFFLINE_ATTEMPT_PREFIX = 'offline:';

/**
 * The verdict the engine would give, in the shape of its submit response, so the runner and
 * the bodies take it as they take the server's. `feedback` follows the engine's
 * `RuleBasedFeedbackGenerator` in PRACTICE, the mode the phone always starts.
 */
export function gradeOffline(
  key: ExerciseKey,
  submittedAnswer: unknown,
  locale: string,
  attemptId: string,
): SubmitAttemptResponse {
  const template = key.templateCode as PhoneGradedTemplate;
  const settings: CheckSettings = {
    ...TEMPLATE_DEFAULTS[template],
    ...(key.answerCheckSettings ?? {}),
  };
  const outcome = JUDGES[template](submittedAnswer, key.expectedAnswers, settings);

  if (outcome.requiresReview) {
    return {
      attemptId,
      correct: false,
      score: 0,
      requiresReview: true,
      feedback: { summary: 'Your answer has been submitted for review.' },
    };
  }

  return {
    attemptId,
    correct: outcome.correct,
    score: outcome.score,
    requiresReview: false,
    feedback: feedbackFor(key, outcome.correct, settings, locale),
  };
}

function feedbackFor(
  key: ExerciseKey,
  correct: boolean,
  settings: CheckSettings,
  locale: string,
): SubmitAttemptResponse['feedback'] {
  if (correct) {
    return { summary: (settings.successMessage as string | undefined) ?? 'Correct!' };
  }

  const list = key.instructions ?? [];
  const instruction =
    list.find(i => i.instructionLanguage === locale) ??
    list.find(i => i.instructionLanguage === 'en') ??
    list[0] ??
    null;
  const hint = instruction?.hintText ?? null;
  const hintTemplate = settings.hintTemplate as string | undefined;
  const correctAnswer = revealedAnswer(key);

  let summary: string;
  if (hintTemplate) {
    // The engine fills it from the grader's details, which the phone does not keep; the
    // placeholders stay empty, as they do for any detail the engine lacks.
    summary = hintTemplate.replace(/\{\{[^}]*\}\}/g, '');
  } else if (hint) {
    summary = hint;
  } else {
    summary = correctAnswer ? `Incorrect. Expected: ${correctAnswer}` : 'Incorrect. Please try again.';
  }

  return {
    summary,
    hints: hint && hintTemplate ? [hint] : undefined,
    correctAnswer: correctAnswer ?? undefined,
  };
}

/** The engine's `extractCorrectAnswer`: a readable key for two templates, none for the rest. */
function revealedAnswer(key: ExerciseKey): string | null {
  const expected = key.expectedAnswers as Record<string, unknown> | null;
  if (!expected) return null;
  if (key.templateCode === 'multiple_choice') {
    const ids = (expected.correct_option_ids as string[] | undefined) ?? [];
    return ids.length > 0 ? ids.join(', ') : null;
  }
  if (key.templateCode === 'fill_in_blank') {
    const blanks = (expected.blanks as Array<{ accepted_answers: string[] }> | undefined) ?? [];
    const answers = blanks.map(b => b.accepted_answers[0] ?? '').filter(Boolean);
    return answers.length > 0 ? answers.join(' / ') : null;
  }
  return null;
}
