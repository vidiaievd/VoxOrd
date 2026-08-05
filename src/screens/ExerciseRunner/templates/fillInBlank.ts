/**
 * Pure mapping logic for the `fill_in_blank` template. Wire shapes confirmed
 * against content-service's seeded template (seed.ts:66-128) and
 * exercise-engine's `FillInBlankValidator` (fill-in-blank.validator.ts).
 *
 * Counterintuitive but confirmed-from-source: `submittedAnswer.blanks[].
 * accepted_answers` is an array (reusing the expected-answer field name), but
 * the validator only ever reads index [0] — that's where the student's typed
 * text goes. The optional `rationale` object is server→client only (surfaced
 * in feedback), the client never sends it.
 */

export type FillInBlankSegment = { type: 'text'; value: string } | { type: 'blank'; id: number };

const BLANK_PATTERN = /___(\d+)___/g;

/** Splits `text_with_blanks` into alternating text/blank segments in order. */
export function parseTextWithBlanks(text: string): FillInBlankSegment[] {
  const segments: FillInBlankSegment[] = [];
  let lastIndex = 0;
  BLANK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'blank', id: Number(match[1]) });
    lastIndex = BLANK_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

export function blankIdsFromSegments(segments: FillInBlankSegment[]): number[] {
  return segments
    .filter((s): s is Extract<FillInBlankSegment, { type: 'blank' }> => s.type === 'blank')
    .map((s) => s.id);
}

/** `ExerciseDisplay.content` for this template. */
export interface FillInBlankContent {
  text_with_blanks: string;
  context?: string;
  word_bank?: string[];
  media_id?: string;
}

export interface FillInBlankAnswer {
  blanks: { blank_id: number; accepted_answers: string[] }[];
}

export function fillInBlankCanSubmit(values: Record<number, string>, blankIds: number[]): boolean {
  return blankIds.length > 0 && blankIds.every((id) => (values[id] ?? '').trim() !== '');
}

export function buildFillInBlankAnswer(
  values: Record<number, string>,
  blankIds: number[],
): FillInBlankAnswer | null {
  if (!fillInBlankCanSubmit(values, blankIds)) return null;
  return {
    blanks: blankIds.map((id) => ({ blank_id: id, accepted_answers: [values[id].trim()] })),
  };
}

/**
 * Reads the expected shape (same as this template's answerSchema, echoed
 * back as `feedback.correctAnswer` in PRACTICE mode) into a `blank_id →
 * first accepted answer` map for display. There is no per-blank correctness
 * in the submit response (only the item-level `correct` flag), so this is
 * used to show the expected word per blank, not to mark individual blanks
 * right/wrong.
 */
export function extractExpectedBlankAnswers(correctAnswer: unknown): Record<number, string> | null {
  if (
    !correctAnswer ||
    typeof correctAnswer !== 'object' ||
    !Array.isArray((correctAnswer as { blanks?: unknown }).blanks)
  ) {
    return null;
  }
  const map: Record<number, string> = {};
  for (const entry of (correctAnswer as FillInBlankAnswer).blanks) {
    if (
      entry &&
      typeof entry.blank_id === 'number' &&
      Array.isArray(entry.accepted_answers) &&
      typeof entry.accepted_answers[0] === 'string'
    ) {
      map[entry.blank_id] = entry.accepted_answers[0];
    }
  }
  return map;
}
