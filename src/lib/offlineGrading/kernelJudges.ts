import * as errorCorrection from '../../kernel/error-correction';
import * as matchPairs from '../../kernel/match-pairs';
import * as translate from '../../kernel/translate';
import { SubmissionShapeError, type CheckSettings } from './judges';

/**
 * The engine's graders for templates whose grading lives in `@ssz/shared-kernel` (offline plan,
 * B5 groups 2–3): thin ports of exercise-engine-service's `match-pairs.validator.ts`,
 * `translate.validator.ts` and `error-correction.validator.ts`, calling the very kernel
 * functions the engine calls (vendored in `src/kernel`, kept in step by `npm run kernel:check`).
 *
 * Each returns `details` already cut down to what the engine's `learnerFacingDetails` lets a
 * learner see — the rest of the engine's details is the teacher's.
 */

export interface KernelJudgeInput {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  /** The full exercise content, not the student projection: these templates keep the key in it. */
  content: unknown;
  templateCode: string;
  settings: CheckSettings;
}

export interface KernelJudgeOutcome {
  correct: boolean;
  score: number;
  requiresReview: boolean;
  /** What the engine would send the learner; undefined where it sends nothing. */
  details?: unknown;
}

const ENVELOPE = { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' };

export function judgeMatchPairs(input: KernelJudgeInput): KernelJudgeOutcome {
  const placements = readPlacements(input.submittedAnswer);
  if (placements === null) throw new SubmissionShapeError('placements');

  const document = matchPairs.fromPersisted(ENVELOPE, input.content, input.expectedAnswers);
  const total = matchPairs.completePairs(document).length;
  if (total === 0) throw new SubmissionShapeError('no pairs');

  const results = matchPairs.grade(document, placements);
  const correctCount = results.filter(result => result.correct).length;
  const allCorrect = correctCount === total;
  const partialCredit = input.settings.allow_partial_credit === true;

  return {
    correct: allCorrect,
    score: allCorrect ? 100 : partialCredit ? Math.round((correctCount / total) * 100) : 0,
    requiresReview: false,
    // `match_pairs` details travel whole: per filled slot, right or wrong and why.
    details: {
      totalPairs: total,
      correctPairs: correctCount,
      pairs: results.map(result => ({
        pairId: result.pairId,
        correct: result.correct,
        explanation: result.explanation,
      })),
    },
  };
}

function readPlacements(submitted: unknown): matchPairs.Placement[] | null {
  if (typeof submitted !== 'object' || submitted === null) return null;
  const { placements } = submitted as { placements?: unknown };
  if (!Array.isArray(placements)) return null;
  const out: matchPairs.Placement[] = [];
  for (const raw of placements) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { pairId, rightId } = raw as { pairId?: unknown; rightId?: unknown };
    if (typeof pairId !== 'string' || typeof rightId !== 'string') return null;
    out.push({ pairId, rightId });
  }
  return out;
}

export function judgeTranslate(input: KernelJudgeInput): KernelJudgeOutcome {
  const list = Array.isArray(input.submittedAnswer)
    ? input.submittedAnswer
    : typeof input.submittedAnswer === 'object' && input.submittedAnswer !== null
      ? (input.submittedAnswer as { answers?: unknown }).answers
      : undefined;
  const answers = Array.isArray(list) ? translate.readSubmission(list) : null;
  if (answers === null) throw new SubmissionShapeError('answers');

  // A mixed set is stored under `translate_to_target`; the code is only a fallback for `dir`.
  const code: translate.TranslateType = translate.isTranslateCode(input.templateCode)
    ? input.templateCode
    : 'translate_to_target';
  const document = translate.fromPersisted(ENVELOPE, code, input.content, input.expectedAnswers);
  const items = translate.runItems(document);
  if (items.length === 0) throw new SubmissionShapeError('no sentences');

  const outcomes = translate.gradeSubmission({ items, check: document.check }, answers);
  const routed = outcomes.filter(outcome => outcome.routing === 'teacher');

  // The engine's `translateRouting`: an item id and a routing, nothing of the key.
  const details = {
    totalItems: items.length,
    passedItems: outcomes.length - routed.length,
    items: outcomes.map(outcome => ({ itemId: outcome.itemId, routing: outcome.routing })),
  };

  return routed.length > 0
    ? { correct: false, score: 0, requiresReview: true, details }
    : { correct: true, score: 100, requiresReview: false, details };
}

export function judgeErrorCorrection(input: KernelJudgeInput): KernelJudgeOutcome {
  const submitted = readEdits(input.submittedAnswer);
  if (submitted === null) throw new SubmissionShapeError('items');

  const document = errorCorrection.fromPersisted(ENVELOPE, input.content, input.expectedAnswers);
  const items = document.items.filter(item => item.wrong.trim() !== '');
  if (items.length === 0) throw new SubmissionShapeError('no sentences');

  const routed = items.filter(item => {
    const judgement = errorCorrection.judge(document.check, item, submitted[item.id]);
    return errorCorrection.route(document.check, judgement) === 'teacher';
  });

  // The engine sends a learner none of this template's details.
  return routed.length > 0
    ? { correct: false, score: 0, requiresReview: true }
    : { correct: true, score: 100, requiresReview: false };
}

function readEdits(submitted: unknown): Record<string, errorCorrection.StudentEdits> | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;
  const { items } = submitted as { items?: unknown };
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;
  const out: Record<string, errorCorrection.StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) {
    out[itemId] = errorCorrection.readEdits(raw);
  }
  return out;
}
