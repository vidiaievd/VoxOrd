/**
 * Block D1 (D): «Plan for today». `ai.practice` has no backend yet — no practice-plan agent
 * (plan 48 step 4) — so it renders nothing, and Today leaves it out of the layout while
 * `TODAY_FEATURES.aiPlan` is off, putting Continue and Review in its place (Home §6.2, D1
 * fallback). Not to be stood in for by the assistant: a plan built from chat would be a
 * product of its own.
 */
export function AiPlan() {
  return null;
}
