/**
 * Pure mapping logic for `writing_task`. Confirmed against content-service's
 * seeded template (prisma/seed.ts ~296-330) and exercise-engine's
 * `FREE_FORM_CODES` (schema-based-answer-validator.ts) — same "always
 * requiresReview: true, correct: false, score: 0" behavior as
 * translate_to_target/translate_from_target, no auto-scoring path.
 *
 * The seeded `answerSchema` declares no `required` fields and doesn't
 * restrict additional properties, so it accepts any object shape — it was
 * evidently never filled in with the student-submission fields (its listed
 * properties, `rubric`/`reference_text`/`criteria`, read as leftover
 * author-side metadata, not something a student would submit). We use the
 * same `{ text }` convention as short_answer/translate since it's the
 * natural shape and trivially passes the permissive schema.
 *
 * NOTE: learning-service also exposes a separate, unrelated draft/revision
 * teacher-review flow (`/review/submissions`) with its own DB tables — it
 * isn't linked to exercise-engine's attempts in any way (no shared id, no
 * cross-service calls), and nothing in ssz-platform-web wires it up either.
 * Deliberately not used here: given the platform's grading flows are still
 * partly client-side and unstabilized, this template sticks to the same
 * proven attempts/submit path used by every other free-form template.
 */

export interface WritingTaskTopic {
  id: string;
  title: string;
  body?: string;
}

export interface WritingTaskContent {
  prompt: string;
  /** Optional "choose one topic" list. */
  options?: WritingTaskTopic[];
  min_words?: number;
  max_words?: number;
  instructions?: string;
  media_id?: string;
}

export interface WritingTaskAnswer {
  text: string;
  topic_id?: string;
}

export function buildWritingTaskAnswer(text: string, topicId: string | null): WritingTaskAnswer | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return topicId ? { text: trimmed, topic_id: topicId } : { text: trimmed };
}

export function writingTaskCanSubmit(text: string, hasTopics: boolean, topicId: string | null): boolean {
  if (hasTopics && !topicId) return false;
  return text.trim() !== '';
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
