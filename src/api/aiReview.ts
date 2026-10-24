import { ApiError, apiClient } from './client';

/* ─────────────────────────────────────────────────────────────────────────
 * A model's review of the learner's own work (plan 79, step 2.3d).
 *
 * Only for the learner nobody reviews: no school, the work read by a model on their own plan
 * (`reviewer: 'ai'` on the hand-in). Everything here is written to the learner — the model,
 * its prompt and its cost stay in the engine and ai-service — and the screen must label it as
 * a review by AI, never as a teacher's word.
 *
 * Contract read 2026-10-24 from exercise-engine's ai-review.controller.ts and
 * learner-ai-review.dto.ts (`GET` and `POST dispute` under the attempt). The web reads the
 * same routes through its BFF, which also names the marks; the phone names them itself from
 * the attempt's `rubricSnapshot` (`criterionNames`).
 * ────────────────────────────────────────────────────────────────────── */

const AI_REVIEW_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/ai-review`;

/** One remark on one item of the answer. */
export interface AiReviewRemark {
  /** The sentence, question, or `text` of an essay the remark is about. */
  itemId: string;
  /** Position of that item in the exercise, from 0. */
  sentenceIndex: number;
  /**
   * `grammar`, `order`, `lexis`, `register`, `meaning`, `alternative`, `task`, `structure`,
   * `content`. Kept as a string: an aspect this app has not heard of reads under its own code
   * rather than failing the review.
   */
  aspect: string;
  /** The words of the answer it points at; `null` for a remark on the answer as a whole. */
  fragment: string | null;
  comment: string;
  suggestion: string | null;
}

/** A mark the model gave out of the essay's rubric, with why. */
export interface AiReviewMark {
  /** As in the attempt's `rubricSnapshot`. */
  criterionId: string;
  mark: 0 | 1 | 2 | 3;
  reason: string;
}

export interface AiReview {
  outcome: 'approved' | 'returned';
  items: AiReviewRemark[];
  /** The model's word on the answer as a whole — also the attempt's `reviewComment`. */
  summary: string | null;
  /** For an essay graded out of a rubric; `null` otherwise. */
  marks: AiReviewMark[] | null;
  reviewedAt: string;
  /** When the learner said the review is wrong; `null` until they do. */
  disputedAt: string | null;
}

/** As long as the engine takes it. */
export const DISPUTE_REASON_MAX = 1000;

/**
 * The review, or `null` when there is none (`NO_AI_REVIEW` — still waiting, a teacher's
 * verdict, nobody to read it): a caller that asked on a hunch gets nothing to draw. The fields
 * are copied one by one, so nothing added upstream reaches the screen by inheritance.
 */
export async function getAiReview(exerciseId: string, attemptId: string): Promise<AiReview | null> {
  let review: AiReview;
  try {
    review = await apiClient.get<AiReview>(AI_REVIEW_PATH(exerciseId, attemptId));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  return {
    outcome: review.outcome,
    items: (review.items ?? []).map(item => ({
      itemId: item.itemId,
      sentenceIndex: item.sentenceIndex,
      aspect: item.aspect,
      fragment: item.fragment ?? null,
      comment: item.comment,
      suggestion: item.suggestion ?? null,
    })),
    summary: review.summary ?? null,
    marks:
      review.marks == null
        ? null
        : review.marks.map(mark => ({
            criterionId: mark.criterionId,
            mark: mark.mark,
            reason: mark.reason,
          })),
    reviewedAt: review.reviewedAt,
    disputedAt: review.disputedAt ?? null,
  };
}

/**
 * «This review is wrong» — once per review; a repeat answers with the time of the first press
 * and counts nothing. The reason travels trimmed, or not at all.
 */
export async function disputeAiReview(
  exerciseId: string,
  attemptId: string,
  reason: string,
): Promise<{ disputedAt: string }> {
  const trimmed = reason.trim().slice(0, DISPUTE_REASON_MAX);
  return apiClient.post<{ disputedAt: string }>(
    `${AI_REVIEW_PATH(exerciseId, attemptId)}/dispute`,
    trimmed === '' ? {} : { reason: trimmed },
  );
}

/**
 * The rubric's criteria as frozen on the attempt, id → name, in rubric order. The engine
 * sends the snapshot only once a verdict is delivered — which a model's is. Anything unread
 * costs the names, never the review.
 */
export function criterionNames(rubricSnapshot: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const criteria = (rubricSnapshot as { criteria?: unknown } | null | undefined)?.criteria;
  if (!Array.isArray(criteria)) return names;
  for (const criterion of criteria) {
    const { id, name } = (criterion ?? {}) as { id?: unknown; name?: unknown };
    if (typeof id === 'string') names.set(id, typeof name === 'string' ? name : '');
  }
  return names;
}
