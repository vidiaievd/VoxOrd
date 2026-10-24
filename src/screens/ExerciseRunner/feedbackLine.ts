/**
 * What the line under the verdict title says, given the engine's `feedback.summary`.
 *
 * The engine writes that summary in English whatever the learner's language
 * (`rule-based-feedback-generator.ts`, `submit-answer.handler.ts`), and most of what it writes
 * is a stock phrase that only repeats the title above it — «Correct!» under «Верно». Those are
 * dropped. «Incorrect. Expected: X» carries a real answer, so its X is kept and the words
 * around it are the app's own. Anything else is the author's text — a hint, a success
 * message, a filled-in template — and is shown as written.
 */

export type FeedbackLine =
  | { kind: 'none' }
  | { kind: 'expected'; answer: string }
  | { kind: 'text'; text: string };

const STOCK = new Set([
  'Correct!',
  'Incorrect. Please try again.',
  'Your answer has been submitted for review.',
  // `reviewer: none` (plan 79, step 2.1c) — the title and note say it in the learner's language.
  'Your answer has been saved. Nobody can check it: there is no teacher to review it and no AI review on your plan.',
]);

const EXPECTED_PREFIX = 'Incorrect. Expected:';

export function feedbackLine(summary: string | null | undefined): FeedbackLine {
  const text = (summary ?? '').trim();
  if (text === '' || STOCK.has(text)) return { kind: 'none' };
  if (text.startsWith(EXPECTED_PREFIX)) {
    const answer = text.slice(EXPECTED_PREFIX.length).trim();
    return answer === '' ? { kind: 'none' } : { kind: 'expected', answer };
  }
  return { kind: 'text', text };
}
