import type { ExerciseInstruction } from '../../api/types';
import { RuleBasedFeedbackGenerator } from '../../enginePort/infrastructure/feedback/rule-based-feedback-generator';
import type { Result } from '../../enginePort/shared/kernel/result';
import type {
  ValidationError,
  ValidationOutcome,
} from '../../enginePort/shared/application/ports/answer-validator.port';
import type { IPerTypeValidator } from '../../enginePort/infrastructure/validation/validators/per-type-validator.interface';
import { DictationValidator } from '../../enginePort/infrastructure/validation/validators/dictation.validator';
import { ErrorCorrectionValidator } from '../../enginePort/infrastructure/validation/validators/error-correction.validator';
import { FillInBlankValidator } from '../../enginePort/infrastructure/validation/validators/fill-in-blank.validator';
import { HighlightInTextValidator } from '../../enginePort/infrastructure/validation/validators/highlight-in-text.validator';
import { InflectionTableValidator } from '../../enginePort/infrastructure/validation/validators/inflection-table.validator';
import { InformationTransferValidator } from '../../enginePort/infrastructure/validation/validators/information-transfer.validator';
import { MatchPairsValidator } from '../../enginePort/infrastructure/validation/validators/match-pairs.validator';
import { MinimalPairsValidator } from '../../enginePort/infrastructure/validation/validators/minimal-pairs.validator';
import { MultipleChoiceGroupValidator } from '../../enginePort/infrastructure/validation/validators/multiple-choice-group.validator';
import { MultipleChoiceValidator } from '../../enginePort/infrastructure/validation/validators/multiple-choice.validator';
import { SentenceSchemaValidator } from '../../enginePort/infrastructure/validation/validators/sentence-schema.validator';
import { ShortAnswerValidator } from '../../enginePort/infrastructure/validation/validators/short-answer.validator';
import { SortIntoBucketsValidator } from '../../enginePort/infrastructure/validation/validators/sort-into-buckets.validator';
import { TextOrderValidator } from '../../enginePort/infrastructure/validation/validators/text-order.validator';
import { TranslateValidator } from '../../enginePort/infrastructure/validation/validators/translate.validator';
import { WordBankFillValidator } from '../../enginePort/infrastructure/validation/validators/word-bank-fill.validator';
import { WordBankGapFillValidator } from '../../enginePort/infrastructure/validation/validators/word-bank-gap-fill.validator';
import { WritingTaskValidator } from '../../enginePort/infrastructure/validation/validators/writing-task.validator';

/**
 * The engine's graders, as its `SchemaBasedAnswerValidator` dispatches them, for every template
 * the phone works offline. One is left out on purpose: `read_aloud` is a recording for a
 * teacher, uploaded to media-service as it is made. `minimal_pairs` is dealt on the phone and
 * the replay hands the draw over (offline plan, B6), unless the author limits its sittings.
 *
 * The engine's first step, an AJV check of the submission against the template's answer
 * schema, is not repeated: the submissions come from this app's own bodies, and the engine
 * runs it again on the replay.
 */
const VALIDATORS: ReadonlyMap<string, IPerTypeValidator> = new Map<string, IPerTypeValidator>([
  ['multiple_choice', new MultipleChoiceValidator()],
  ['multiple_choice_group', new MultipleChoiceGroupValidator()],
  ['fill_in_blank', new FillInBlankValidator()],
  ['match_pairs', new MatchPairsValidator()],
  ['minimal_pairs', new MinimalPairsValidator()],
  ['short_answer', new ShortAnswerValidator()],
  ['sentence_schema', new SentenceSchemaValidator()],
  ['word_bank_fill', new WordBankFillValidator()],
  ['word_bank_gap_fill', new WordBankGapFillValidator()],
  ['text_order', new TextOrderValidator()],
  ['error_correction', new ErrorCorrectionValidator()],
  ['translate_to_target', new TranslateValidator()],
  ['translate_from_target', new TranslateValidator()],
  ['writing_task', new WritingTaskValidator()],
  ['sort_into_buckets', new SortIntoBucketsValidator()],
  ['highlight_in_text', new HighlightInTextValidator()],
  ['dictation', new DictationValidator()],
  ['inflection_table', new InflectionTableValidator()],
  ['information_transfer', new InformationTransferValidator()],
]);

export function isGradedOffline(templateCode: string): boolean {
  return VALIDATORS.has(templateCode);
}

/**
 * Each template's `defaultCheckSettings` as content-service holds them (read from the stand's
 * `exercise_templates`, 15.10.2026). The engine lays the exercise's own settings over these.
 */
const TEMPLATE_DEFAULTS: Readonly<Record<string, Record<string, unknown>>> = {
  dictation: {},
  error_correction: { allow_partial_credit: true },
  fill_in_blank: { case_sensitive: false, trim_whitespace: true, allow_partial_credit: true },
  highlight_in_text: {},
  inflection_table: {},
  information_transfer: {},
  match_pairs: { allow_partial_credit: true },
  minimal_pairs: {},
  multiple_choice: { allow_partial_credit: false },
  multiple_choice_group: { allow_partial_credit: true },
  sentence_schema: { order_sensitive: true, allow_partial_credit: true },
  short_answer: { case_sensitive: false, trim_whitespace: true },
  sort_into_buckets: {},
  text_order: { allow_partial_credit: true },
  translate_from_target: { allow_partial_credit: false },
  translate_to_target: { allow_partial_credit: false },
  word_bank_fill: {
    case_sensitive: false,
    trim_whitespace: true,
    unique_bank_words: true,
    allow_partial_credit: true,
  },
  word_bank_gap_fill: { allow_partial_credit: true },
  writing_task: {},
};

/** What the download keeps of `GET /exercises/:id/answers` — the key and what frames it. */
export interface ExerciseKey {
  templateCode: string;
  /** The full content: several templates keep their answers inside it. */
  content?: unknown;
  expectedAnswers: unknown;
  answerCheckSettings: Record<string, unknown> | null;
  instructions: ExerciseInstruction[] | null;
}

export function checkSettingsOf(key: ExerciseKey): Record<string, unknown> {
  return { ...(TEMPLATE_DEFAULTS[key.templateCode] ?? {}), ...(key.answerCheckSettings ?? {}) };
}

export function validate(
  key: ExerciseKey,
  submittedAnswer: unknown,
  targetLanguage: string,
): Result<ValidationOutcome, ValidationError> {
  const validator = VALIDATORS.get(key.templateCode);
  if (!validator) throw new Error(`No offline grader for ${key.templateCode}`);
  return validator.validate({
    submittedAnswer,
    expectedAnswers: key.expectedAnswers,
    content: key.content,
    templateCode: key.templateCode,
    checkSettings: checkSettingsOf(key),
    targetLanguage,
  });
}

/**
 * The instruction the engine is handed with the exercise: content-service picks it for the
 * attempt's language, then English, then the first there is (`get-exercise-envelope.handler`).
 */
function instructionFor(key: ExerciseKey, targetLanguage: string) {
  const list = key.instructions ?? [];
  const picked =
    list.find(i => i.instructionLanguage === targetLanguage) ??
    list.find(i => i.instructionLanguage === 'en') ??
    list[0] ??
    null;
  return picked
    ? { language: picked.instructionLanguage, text: picked.instructionText, hint: picked.hintText }
    : null;
}

const feedbackGenerator = new RuleBasedFeedbackGenerator();

/** The engine's feedback for a verdict, from its own generator, in PRACTICE. */
export async function feedbackFor(
  key: ExerciseKey,
  outcome: ValidationOutcome,
  targetLanguage: string,
  locale: string,
): Promise<{ summary: string; hints?: string[]; correctAnswer?: unknown }> {
  const generated = await feedbackGenerator.generate({
    templateCode: key.templateCode,
    correct: outcome.correct,
    score: outcome.score,
    validationDetails: outcome.details,
    exerciseDefinition: {
      exercise: { answerCheckSettings: key.answerCheckSettings, expectedAnswers: key.expectedAnswers },
      template: { defaultCheckSettings: TEMPLATE_DEFAULTS[key.templateCode] ?? {} },
      instruction: instructionFor(key, targetLanguage),
    },
    locale,
    revealAnswer: true,
  });
  return generated.isOk
    ? (generated.value as { summary: string; hints?: string[]; correctAnswer?: unknown })
    : { summary: outcome.correct ? 'Correct!' : 'Incorrect. Please try again.' };
}

/** Where the download keeps an exercise's key, beside its display. */
export function exerciseKeyCacheKey(exerciseId: string): string {
  return `exercise-key:${exerciseId}`;
}
