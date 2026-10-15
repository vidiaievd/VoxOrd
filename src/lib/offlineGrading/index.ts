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
} from './judges';
import {
  judgeErrorCorrection,
  judgeMatchPairs,
  judgeTranslate,
  type KernelJudgeInput,
  type KernelJudgeOutcome,
} from './kernelJudges';

/**
 * Grading on the phone, for when the server cannot be reached (offline plan, B5).
 *
 * Only templates handed in once, by the runner's own «Check» — the ones where a verdict is a
 * function of the document and the answer alone:
 *
 * - group 1, the documents the web grades in the browser too (`gradedInBrowser` in
 *   ssz-platform-web's `grading-side.ts`), graded by a port of the engine's validator;
 * - `match_pairs`, `translate_*`, `error_correction`, graded by the engine's own kernel
 *   functions (`src/kernel`). Their key reaches the phone — the price the plan accepted for
 *   practice offline (B0.2): the engine grades the queued attempt again either way;
 * - `writing_task`, which the engine always hands to a teacher: offline it is queued as is.
 *
 * Templates that check piece by piece — a budget of re-checks, rows frozen between checks,
 * a question at a time — keep that state on the server, and offline they say so.
 */
const KEYED_TEMPLATES = [
  'multiple_choice',
  'multiple_choice_group',
  'fill_in_blank',
  'short_answer',
  'word_bank_fill',
  'text_order',
  'match_pairs',
  'translate_to_target',
  'translate_from_target',
  'error_correction',
] as const;

type KeyedTemplate = (typeof KEYED_TEMPLATES)[number];

/** Graded by a teacher whatever is written: the phone needs no key to queue it. */
const REVIEW_ONLY_TEMPLATES = ['writing_task'] as const;

function isKeyed(templateCode: string): templateCode is KeyedTemplate {
  return (KEYED_TEMPLATES as readonly string[]).includes(templateCode);
}

/** Whether the phone may take this document's answer offline at all. */
export function gradedOnPhone(templateCode: string, content: unknown): boolean {
  if ((REVIEW_ONLY_TEMPLATES as readonly string[]).includes(templateCode)) return true;
  if (!isKeyed(templateCode)) return false;
  // One code, two live document shapes graded on opposite sides; the new forms dose
  // their key on the server (second try, retry budget), so they stay there.
  if (templateCode === 'short_answer') return !isShortAnswerDocument(content);
  if (templateCode === 'multiple_choice') return !isMultipleChoiceDocument(content);
  if (templateCode === 'multiple_choice_group') return !isMultipleChoiceGroupDocument(content);
  return true;
}

/** Whether grading it offline needs the key — what the download fetches. */
export function needsKey(templateCode: string, content: unknown): boolean {
  return isKeyed(templateCode) && gradedOnPhone(templateCode, content);
}

/**
 * Each template's `defaultCheckSettings`, as content-service's `prisma/seed.ts` writes them.
 * The engine lays the exercise's own settings over these; so does the phone.
 */
const TEMPLATE_DEFAULTS: Record<KeyedTemplate, CheckSettings> = {
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
  match_pairs: { allow_partial_credit: true },
  translate_to_target: { allow_partial_credit: false },
  translate_from_target: { allow_partial_credit: false },
  error_correction: { allow_partial_credit: true },
};

const legacy =
  (judge: (submitted: unknown, expected: unknown, settings: CheckSettings) => KernelJudgeOutcome) =>
  (input: KernelJudgeInput): KernelJudgeOutcome =>
    judge(input.submittedAnswer, input.expectedAnswers, input.settings);

const JUDGES: Record<KeyedTemplate, (input: KernelJudgeInput) => KernelJudgeOutcome> = {
  multiple_choice: legacy(judgeMultipleChoiceLegacy),
  multiple_choice_group: legacy(judgeMultipleChoiceGroupLegacy),
  fill_in_blank: legacy(judgeFillInBlank),
  word_bank_fill: legacy(judgeWordBankFill),
  text_order: legacy(judgeTextOrder),
  short_answer: legacy(judgeShortAnswerLegacy),
  match_pairs: judgeMatchPairs,
  translate_to_target: judgeTranslate,
  translate_from_target: judgeTranslate,
  error_correction: judgeErrorCorrection,
};

/** What the download keeps of `GET /exercises/:id/answers` — the key and what frames it. */
export interface ExerciseKey {
  templateCode: string;
  /** The full content: `match_pairs` and `translate_*` keep their answers inside it. */
  content?: unknown;
  expectedAnswers: unknown;
  answerCheckSettings: CheckSettings | null;
  instructions: ExerciseInstruction[] | null;
}

export function exerciseKeyCacheKey(exerciseId: string): string {
  return `exercise-key:${exerciseId}`;
}

/** The verdict id of an attempt graded on the phone; the server's replaces it later. */
export const OFFLINE_ATTEMPT_PREFIX = 'offline:';

const REVIEW_SUMMARY = 'Your answer has been submitted for review.';

/**
 * The verdict the engine would give, in the shape of its submit response, so the runner and
 * the bodies take it as they take the server's. `feedback` follows the engine's
 * `RuleBasedFeedbackGenerator` in PRACTICE, the mode the phone always starts; an answer
 * handed to a teacher gets the engine's «submitted for review».
 */
export function gradeOffline(
  key: ExerciseKey | null,
  templateCode: string,
  submittedAnswer: unknown,
  locale: string,
  attemptId: string,
): SubmitAttemptResponse {
  if (!isKeyed(templateCode)) {
    // A template only a teacher grades: nothing to compute, the text goes as written.
    return {
      attemptId,
      correct: false,
      // The engine scores nothing a teacher has yet to mark.
      score: null,
      requiresReview: true,
      feedback: { summary: REVIEW_SUMMARY },
    };
  }
  if (!key) throw new Error(`No key kept for ${templateCode}`);

  const settings: CheckSettings = {
    ...TEMPLATE_DEFAULTS[templateCode],
    ...(key.answerCheckSettings ?? {}),
  };
  const outcome = JUDGES[templateCode]({
    submittedAnswer,
    expectedAnswers: key.expectedAnswers,
    content: key.content,
    templateCode,
    settings,
  });

  if (outcome.requiresReview) {
    return {
      attemptId,
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: REVIEW_SUMMARY },
      ...(outcome.details !== undefined ? { details: outcome.details } : {}),
    };
  }

  return {
    attemptId,
    correct: outcome.correct,
    score: outcome.score,
    requiresReview: false,
    feedback: feedbackFor(key, outcome.correct, settings, locale),
    ...(outcome.details !== undefined ? { details: outcome.details } : {}),
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
