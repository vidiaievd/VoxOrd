import { apiClient } from './client';

/* ─────────────────────────────────────────────────────────────────────────
 * Grammar rules due for review (mobile redesign 05, step 7 — Practice 6a/6l).
 *
 * learning-service decides, not the phone (owner, 2026-10-28): the rule reads the EXERCISE
 * cards of each rule's pool, which only the server has. Due = mastery under 70 % and a week
 * without practice, or two pool cards lapsed on their last review. A fall from the peak is
 * not a criterion — nothing keeps a mastery history — so the screen has no «was {peak}%».
 * Confirmed against services/learning-service/src/modules/srs/presentation/mastery.controller.ts
 * and application/services/grammar-rule-review.policy.ts; covered by the gateway's existing
 * `/api/v1/mastery` block.
 * ────────────────────────────────────────────────────────────────────── */

const DUE_PATH = '/api/v1/mastery/grammar-rules/due';
const REVIEW_PATH = (ruleId: string) => `/api/v1/mastery/grammar-rules/${ruleId}/review`;

export type GrammarDueReason = 'stale' | 'mistakes';

interface RawReviewState {
  grammarRuleId: string;
  poolSize: number;
  introducedCount: number;
  averageRetrievability: number;
  lastPracticedAt: string | null;
  strugglingCount: number;
  dueReasons: GrammarDueReason[];
}

export interface GrammarRuleReviewState {
  grammarRuleId: string;
  poolSize: number;
  masteryPercent: number;
  /** The latest review of any of the rule's exercises; null when none was reviewed. */
  lastPracticedAt: string | null;
  /** Exercises of the rule whose last review lapsed. */
  strugglingCount: number;
  dueReasons: GrammarDueReason[];
}

export interface DueGrammarRule extends GrammarRuleReviewState {
  /** The unit the rule sits in; null when it hangs directly under the course. */
  moduleId: string | null;
}

export interface GrammarRuleReview extends GrammarRuleReviewState {
  /** Up to eight exercise ids: lapsed first, then the longest unpractised. */
  reviewPool: string[];
}

function toState(raw: RawReviewState): GrammarRuleReviewState {
  return {
    grammarRuleId: raw.grammarRuleId,
    poolSize: raw.poolSize,
    masteryPercent: Math.round(raw.averageRetrievability * 100),
    lastPracticedAt: raw.lastPracticedAt,
    strugglingCount: raw.strugglingCount,
    dueReasons: raw.dueReasons,
  };
}

/** The course's due rules, lowest mastery first. */
export async function getDueGrammarRules(courseId: string): Promise<DueGrammarRule[]> {
  const raw = await apiClient.get<{ courseId: string; rules: Array<RawReviewState & { moduleId: string | null }> }>(
    DUE_PATH,
    { query: { courseId } },
  );
  return raw.rules.map(rule => ({ ...toState(rule), moduleId: rule.moduleId }));
}

export async function getGrammarRuleReview(ruleId: string): Promise<GrammarRuleReview> {
  const raw = await apiClient.get<RawReviewState & { reviewPool: string[] }>(REVIEW_PATH(ruleId));
  return { ...toState(raw), reviewPool: raw.reviewPool };
}
