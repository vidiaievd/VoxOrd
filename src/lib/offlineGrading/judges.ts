import { checkShortAnswer, type ShortAnswerKey } from './shortAnswerDiff';

/**
 * The engine's graders for the templates the web grades in the browser (offline plan, B5,
 * group 1), ported from exercise-engine-service `src/infrastructure/validation/validators/`:
 * `fill-in-blank.validator.ts`, `word-bank-fill.validator.ts`, `text-order.validator.ts`,
 * `multiple-choice-legacy.ts`, `multiple-choice-group-legacy.ts`, `short-answer-legacy.ts`.
 *
 * Only the verdict is ported — `correct`, `score`, `requiresReview` — because that is all
 * the learner is shown for these templates: the engine sends no `details` for them
 * (`learnerFacingDetails`). The engine grades the queued attempt again when it arrives and
 * its verdict is the one recorded, so a drift here shows the learner a wrong mark offline;
 * change these with the engine's, never apart.
 */

export interface JudgeOutcome {
  correct: boolean;
  score: number;
  requiresReview: boolean;
}

export type CheckSettings = Record<string, unknown>;

/** The submission does not have the shape the engine accepts — it would refuse it too. */
export class SubmissionShapeError extends Error {}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string, caseSensitive: boolean, trimWhitespace: boolean): string {
  const result = trimWhitespace ? s.trim() : s;
  return caseSensitive ? result : result.toLowerCase();
}

/** The share of `correct` out of `total`, the way every group-1 grader turns it into a score. */
function shareScore(correctCount: number, totalCount: number, allowPartial: boolean): number {
  if (totalCount === 0) return 100;
  if (allowPartial) return Math.round((100 * correctCount) / totalCount);
  return correctCount === totalCount ? 100 : 0;
}

interface BlankEntry {
  blank_id: number;
  accepted_answers: string[];
}

export function judgeFillInBlank(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  const submitted = submittedAnswer as { blanks: BlankEntry[] };
  const expected = expectedAnswers as { blanks: BlankEntry[] };
  if (!Array.isArray(submitted?.blanks)) throw new SubmissionShapeError('blanks');

  const caseSensitive = settings.case_sensitive === true;
  const trimWhitespace = settings.trim_whitespace !== false;
  const fuzzy = settings.fuzzy as { editDistance: number } | undefined;
  const allowPartial = settings.allow_partial_credit !== false;

  const expectedMap = new Map(expected.blanks.map(b => [b.blank_id, b]));
  let correctCount = 0;
  for (const submittedBlank of submitted.blanks) {
    const expectedBlank = expectedMap.get(submittedBlank.blank_id);
    if (!expectedBlank) continue;
    const normSubmitted = normalize(
      submittedBlank.accepted_answers[0] ?? '',
      caseSensitive,
      trimWhitespace,
    );
    const correct = expectedBlank.accepted_answers.some(acc => {
      const normAcc = normalize(acc, caseSensitive, trimWhitespace);
      if (normSubmitted === normAcc) return true;
      return fuzzy != null && levenshtein(normSubmitted, normAcc) <= fuzzy.editDistance;
    });
    if (correct) correctCount += 1;
  }

  const score = shareScore(correctCount, expected.blanks.length, allowPartial);
  return { correct: score === 100, score, requiresReview: false };
}

export function judgeWordBankFill(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  type Items = { items: Array<{ id: string; blanks: BlankEntry[] }> };
  const submitted = submittedAnswer as Items;
  const expected = expectedAnswers as Items;

  const caseSensitive = settings.case_sensitive === true;
  const trimWhitespace = settings.trim_whitespace !== false;
  const allowPartial = settings.allow_partial_credit !== false;

  const submittedMap = new Map<string, Map<number, string>>();
  for (const item of submitted?.items ?? []) {
    submittedMap.set(
      item.id,
      new Map((item.blanks ?? []).map(b => [b.blank_id, b.accepted_answers[0] ?? ''])),
    );
  }

  let total = 0;
  let correctCount = 0;
  for (const expectedItem of expected.items) {
    const submittedBlanks = submittedMap.get(expectedItem.id);
    for (const expectedBlank of expectedItem.blanks) {
      total += 1;
      const answer = submittedBlanks?.get(expectedBlank.blank_id) ?? '';
      const normSubmitted = normalize(answer, caseSensitive, trimWhitespace);
      const correct =
        answer !== '' &&
        expectedBlank.accepted_answers.some(
          acc => normalize(acc, caseSensitive, trimWhitespace) === normSubmitted,
        );
      if (correct) correctCount += 1;
    }
  }

  const score = shareScore(correctCount, total, allowPartial);
  return { correct: score === 100, score, requiresReview: false };
}

export function judgeTextOrder(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  const submittedOrder = (submittedAnswer as { order?: string[] })?.order ?? [];
  const expected = expectedAnswers as { order: string[] };
  const allowPartial = settings.allow_partial_credit !== false;

  const submittedIndex = new Map<string, number>();
  submittedOrder.forEach((id, i) => {
    // A duplicated id can only occupy one slot; the first wins.
    if (!submittedIndex.has(id)) submittedIndex.set(id, i);
  });

  const totalCount = expected.order.length;
  const correctCount = expected.order.filter((id, i) => submittedIndex.get(id) === i).length;
  const score = shareScore(correctCount, totalCount, allowPartial);

  // An answer that omits or invents items is never fully correct.
  const sameLength = submittedOrder.length === totalCount;
  return {
    correct: sameLength && correctCount === totalCount,
    score: sameLength ? score : Math.min(score, 99),
    requiresReview: false,
  };
}

export function judgeMultipleChoiceLegacy(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  const ids = (submittedAnswer as { correct_option_ids?: unknown })?.correct_option_ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) {
    throw new SubmissionShapeError('correct_option_ids');
  }
  const submittedSet = new Set(ids as string[]);
  const expectedSet = new Set((expectedAnswers as { correct_option_ids: string[] }).correct_option_ids);

  const correctSelected = [...submittedSet].filter(id => expectedSet.has(id));
  const wrongSelected = [...submittedSet].filter(id => !expectedSet.has(id));
  const exactMatch = correctSelected.length === expectedSet.size && wrongSelected.length === 0;
  const allowPartial = settings.allow_partial_credit === true;

  let score: number;
  if (exactMatch) {
    score = 100;
  } else if (allowPartial && expectedSet.size > 0) {
    // Each wrong pick cancels one correct pick.
    score = Math.max(
      0,
      Math.round((100 * (correctSelected.length - wrongSelected.length)) / expectedSet.size),
    );
  } else {
    score = 0;
  }
  return { correct: score === 100, score, requiresReview: false };
}

export function judgeMultipleChoiceGroupLegacy(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  const items = (submittedAnswer as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0) throw new SubmissionShapeError('items');
  const picksById = new Map<string, string[]>();
  for (const raw of items) {
    const { id, correct_option_ids: picks } = (raw ?? {}) as {
      id?: unknown;
      correct_option_ids?: unknown;
    };
    if (typeof id !== 'string' || id === '' || !Array.isArray(picks)) {
      throw new SubmissionShapeError('items');
    }
    picksById.set(id, picks as string[]);
  }

  const expected = expectedAnswers as { items: Array<{ id: string; correct_option_ids: string[] }> };
  const allowPartial = settings.allow_partial_credit !== false;
  const sameSet = (a: string[], b: string[]) => {
    const left = new Set(a);
    const right = new Set(b);
    return left.size === right.size && [...left].every(id => right.has(id));
  };

  const correctCount = expected.items.filter(item => {
    const picks = picksById.get(item.id) ?? [];
    return picks.length > 0 && sameSet(picks, item.correct_option_ids);
  }).length;

  const score = shareScore(correctCount, expected.items.length, allowPartial);
  return { correct: score === 100, score, requiresReview: false };
}

export function judgeShortAnswerLegacy(
  submittedAnswer: unknown,
  expectedAnswers: unknown,
  settings: CheckSettings,
): JudgeOutcome {
  const text = (submittedAnswer as { text?: unknown })?.text;
  if (typeof text !== 'string') throw new SubmissionShapeError('text');
  const expected = expectedAnswers as ShortAnswerKey;
  const diff = checkShortAnswer(expected, text);

  if (diff.ok === true && settings.case_sensitive === true) {
    // The diff compares case-insensitively; an exercise that counts case re-checks literally.
    const value = text.trim();
    const candidates = [
      ...(expected.accepted_answers ?? []),
      ...(expected.reference_answer ? [expected.reference_answer] : []),
    ];
    if (!candidates.some(candidate => candidate.trim() === value)) {
      return { correct: false, score: 0, requiresReview: false };
    }
  }

  if (diff.ok === null) return { correct: false, score: 0, requiresReview: true };
  return { correct: diff.ok, score: diff.score, requiresReview: false };
}
