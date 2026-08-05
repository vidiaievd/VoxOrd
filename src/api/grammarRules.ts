import { apiClient } from './client';
import type { DifficultyLevel } from './types';

const GRAMMAR_RULE_BEST_EXPLANATION_PATH = (ruleId: string) =>
  `/api/v1/grammar-rules/${ruleId}/explanations/best`;
const GRAMMAR_RULE_POOL_PATH = (ruleId: string) => `/api/v1/grammar-rules/${ruleId}/pool`;

export interface GrammarRuleExplanationQuery {
  studentNativeLanguage: string;
  studentCurrentLevel: DifficultyLevel;
}

/**
 * `GET /grammar-rules/:id/explanations/best?lang=&level=&knownLangs=`
 * (content-service) — server picks the best-fit explanation for the
 * student's profile, same idea as the lesson reader's `/reader` endpoint.
 * Confirmed against services/content-service/src/modules/grammar-rule/
 * presentation/controllers/grammar-rule.controller.ts (`findBestExplanation`)
 * and grammar-rule-explanation.response.dto.ts.
 *
 * Query param names are `lang`/`level` here (not `studentNativeLanguage`/
 * `studentCurrentLevel` as in the lessons reader) — this is a different
 * controller with its own param names, not an inconsistency to "fix" client-side.
 *
 * `compareExamples`/`quickCheck` exist on the response DTO but the current
 * seed data never populates them (only title/summary/bodyMarkdown are
 * reliably present), so they're intentionally not modeled here yet.
 */
export interface GrammarRuleExplanation {
  id: string;
  grammarRuleId: string;
  displayTitle: string;
  displaySummary: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
}

export async function getGrammarRuleExplanation(
  ruleId: string,
  query: GrammarRuleExplanationQuery,
): Promise<GrammarRuleExplanation> {
  const result = await apiClient.get<{ explanation: GrammarRuleExplanation; fallbackUsed: boolean }>(
    GRAMMAR_RULE_BEST_EXPLANATION_PATH(ruleId),
    {
      query: {
        lang: query.studentNativeLanguage,
        level: query.studentCurrentLevel,
      },
    },
  );
  return result.explanation;
}

interface RawPoolEntry {
  exerciseId: string;
  position: number;
}

/**
 * `GET /grammar-rules/:id/pool?limit=&sort=position_asc` (content-service) —
 * the same pool the server averages retrievability over for the mastery %
 * (grammar-rule-mastery.service.ts). JWT-guarded and distinct from the
 * internal-only `pool-exercise-ids` route learning-service uses (that one is
 * gated by an internal token, not reachable from mobile).
 *
 * A single page (`limit: 50`) is fetched, not the full pagination — grammar
 * rule pools are small (seed data tops out well under that); revisit if a
 * rule ever needs paging.
 */
export async function getGrammarRulePoolExerciseIds(ruleId: string): Promise<string[]> {
  const result = await apiClient.get<{ items: RawPoolEntry[] }>(GRAMMAR_RULE_POOL_PATH(ruleId), {
    query: { limit: 50, sort: 'position_asc' },
  });
  return result.items.map((item) => item.exerciseId);
}
