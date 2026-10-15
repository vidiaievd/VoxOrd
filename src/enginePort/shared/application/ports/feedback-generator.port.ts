// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/services/exercise-engine-service/src/shared/application/ports/feedback-generator.port.ts
// Regenerate with `npm run engine:sync`; verify with `npm run engine:check`.
// ---------------------------------------------------------------------------

import type { Result } from '../../kernel/result';

export const FEEDBACK_GENERATOR = Symbol('IFeedbackGenerator');

export interface FeedbackInput {
  templateCode: string;
  correct: boolean;
  score: number;
  validationDetails: unknown;
  exerciseDefinition: unknown; // full bundle from IContentClient
  locale: string;
  // False for GRADED attempts — the correct answer must not leak into feedback text.
  revealAnswer: boolean;
}

export interface FeedbackOutput {
  summary: string;
  hints?: string[];
  correctAnswer?: unknown;
}

export interface IFeedbackGenerator {
  generate(input: FeedbackInput): Promise<Result<FeedbackOutput, Error>>;
}
