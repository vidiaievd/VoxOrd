/**
 * Pure mapping logic shared by `translate_to_target` and
 * `translate_from_target` — identical wire shape, confirmed against
 * content-service's seeded templates (seed.ts ~132-193).
 *
 * Both go to a person: `translate.validator.ts` in exercise-engine returns
 * `requiresReview: true, correct: false, score: 0` once the answer passes AJV, and
 * there is no auto-scoring path at all. (The `FREE_FORM_CODES` set this used to name
 * is gone — every template that routes to review now says so in its own validator.) AJV still enforces the shape
 * below (confirmed by the engine's own unit test), so the client can't send
 * a bare string.
 */

export interface TranslateContent {
  source_text: string;
  /** Only meaningfully present for translate_to_target. */
  source_language?: string;
  context?: string;
  media_id?: string;
}

/**
 * The client's single free-text translation goes in the one array element —
 * same field name reused from `expectedAnswers`, same pattern as
 * fill_in_blank's `accepted_answers`.
 */
export interface TranslateAnswer {
  accepted_translations: string[];
  explanation?: string;
}

export function buildTranslateAnswer(text: string): TranslateAnswer | null {
  const trimmed = text.trim();
  return trimmed ? { accepted_translations: [trimmed] } : null;
}

export function translateCanSubmit(text: string): boolean {
  return text.trim() !== '';
}
