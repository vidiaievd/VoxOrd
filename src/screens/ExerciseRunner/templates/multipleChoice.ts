/**
 * Pure mapping logic for the `multiple_choice` template. Wire shapes
 * confirmed against content-service's seeded template (seed.ts:19-52) and
 * exercise-engine's `MultipleChoiceValidator` (multiple-choice.validator.ts) —
 * NOT the web reader's client-side grading shape, which the mobile app
 * intentionally does not use (see src/api/exercises.ts).
 */

export interface McqOption {
  id: string;
  text: string;
}

/** `ExerciseDisplay.content` for this template. */
export interface McqContent {
  question: string;
  options: McqOption[];
  context?: string;
  media_id?: string;
}

/**
 * Both `submittedAnswer` and `expectedAnswers`/`correctAnswer` share this
 * shape. It's an array to support single- AND multi-select variants — a
 * single-answer exercise just has exactly one element (per the answerSchema's
 * own comment).
 */
export interface McqAnswer {
  correct_option_ids: string[];
}

export function buildMcqAnswer(selectedId: string | null): McqAnswer | null {
  return selectedId ? { correct_option_ids: [selectedId] } : null;
}

export function mcqCanSubmit(selectedId: string | null): boolean {
  return selectedId !== null;
}

/** Reads the option ids out of an opaque `feedback.correctAnswer` value. */
export function extractCorrectOptionIds(correctAnswer: unknown): string[] | null {
  if (
    correctAnswer &&
    typeof correctAnswer === 'object' &&
    Array.isArray((correctAnswer as { correct_option_ids?: unknown }).correct_option_ids)
  ) {
    return (correctAnswer as McqAnswer).correct_option_ids;
  }
  return null;
}
