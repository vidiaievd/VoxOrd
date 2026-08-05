/**
 * Pure mapping logic for `short_answer`. Wire shape confirmed against
 * content-service's seeded template (prisma/seed.ts) and exercise-engine's
 * `ShortAnswerValidator` (short-answer.validator.ts, reads
 * `submittedAnswer.text`).
 *
 * NOTE: at the time Step 4.1–4.3 were built, the platform's seeded
 * `answerSchema` for this template only accepted the author's
 * expectedAnswers shape (`reference_answer`), not a real student submission
 * (`text`) — any submit would have failed server-side AJV validation before
 * ever reaching ShortAnswerValidator. Fixed in ssz-platform (content-service
 * prisma/seed.ts, `anyOf: [{required:['text']},{required:['reference_answer']}]`)
 * before implementing this template client-side; see that repo's commit for
 * the full analysis. Requires re-running content-service's seed script
 * against any environment that already seeded the old schema.
 *
 * ShortAnswerValidator either auto-matches against `accepted_answers`
 * (correct:true, score:100) or routes to human/LLM review (requiresReview:
 * true) — it never returns a flat "incorrect", by design (a reference answer
 * alone isn't reliable enough to auto-fail free text).
 */

export interface ShortAnswerContent {
  question: string;
  context?: string;
  media_id?: string;
  /** Soft length guidance for the UI (characters), not enforced client-side. */
  max_length?: number;
}

export interface ShortAnswerAnswer {
  text: string;
}

export function buildShortAnswerAnswer(text: string): ShortAnswerAnswer | null {
  const trimmed = text.trim();
  return trimmed ? { text: trimmed } : null;
}

export function shortAnswerCanSubmit(text: string): boolean {
  return text.trim() !== '';
}

/** Reads a human-readable model answer out of an opaque `feedback.correctAnswer`. */
export function extractReferenceAnswer(correctAnswer: unknown): string | null {
  if (
    correctAnswer &&
    typeof correctAnswer === 'object' &&
    typeof (correctAnswer as { reference_answer?: unknown }).reference_answer === 'string'
  ) {
    return (correctAnswer as { reference_answer: string }).reference_answer;
  }
  return null;
}
