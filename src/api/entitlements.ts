import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * What the learner's payer may use (mobile redesign 02, step 2).
 *
 * subscription-service `GET /api/v1/subscriptions/me[?workspaceId=]`; types as the web's
 * `features/entitlements/types.ts`. For drawing controls only: the service that runs a
 * feature checks the rights itself, so a wrong guess here hides a button and lets nothing in.
 *
 * Whose rights: a learner in a school runs on the school's plan (plan 48 R1) — `review_draft`
 * is only ever a school's key — so a learner with a school reads every school they are placed
 * in and takes a key as on when any of them has it; a learner with none reads their own.
 * (Owner's decision, 2026-10-24.)
 * ────────────────────────────────────────────────────────────────────── */

export type FeatureKey =
  | 'ai.review_draft'
  | 'ai.review_direct'
  | 'ai.student_assist'
  | 'ai.practice'
  | 'ai.authoring';

export interface FeatureEntitlement {
  enabled: boolean;
  /** Credits per credit period; null = unmetered. A decimal string, never a float. */
  monthlyCredits: string | null;
}

export interface Entitlements {
  /** A key absent here is not available. */
  features: Partial<Record<string, FeatureEntitlement>>;
  /** When time alone changes this answer. ISO 8601. */
  validUntil: string;
}

const PATH = '/api/v1/subscriptions/me';

/** Field by field, so nothing added upstream reaches the screen; null when it is not rights. */
export function parseEntitlements(raw: unknown): Entitlements | null {
  if (!isRecord(raw) || !isRecord(raw.features) || !isString(raw.validUntil)) return null;
  if (Number.isNaN(Date.parse(raw.validUntil))) return null;
  const features: Record<string, FeatureEntitlement> = {};
  for (const [key, value] of Object.entries(raw.features)) {
    if (!isRecord(value) || typeof value.enabled !== 'boolean') continue;
    features[key] = { enabled: value.enabled, monthlyCredits: stringOrNull(value.monthlyCredits) };
  }
  return { features, validUntil: raw.validUntil };
}

/**
 * One context's rights. Throws when the service is out of reach (a 503 «membership could not
 * be checked» included), so a cached answer stays; a refusal (403, not a member) or a
 * malformed answer is `null` — no rights to show.
 */
export async function getEntitlements(workspaceId?: string): Promise<Entitlements | null> {
  try {
    return parseEntitlements(
      await apiClient.get(PATH, { query: workspaceId ? { workspaceId } : undefined }),
    );
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}

/** Larger of two credit allowances; null (unmetered) beats any number. */
function moreCredits(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  return Number(b) > Number(a) ? b : a;
}

/**
 * Several schools' rights as one: a key is on when any school has it on, with the larger
 * allowance among those that do; the answer is good until the first of them changes.
 */
export function mergeEntitlements(all: readonly Entitlements[]): Entitlements | null {
  if (all.length === 0) return null;
  const features: Record<string, FeatureEntitlement> = {};
  for (const e of all) {
    for (const [key, f] of Object.entries(e.features)) {
      if (!f) continue;
      const seen = features[key];
      if (!seen || (!seen.enabled && f.enabled)) features[key] = { ...f };
      else if (seen.enabled && f.enabled) {
        features[key] = { enabled: true, monthlyCredits: moreCredits(seen.monthlyCredits, f.monthlyCredits) };
      }
    }
  }
  const validUntil = all.map((e) => e.validUntil).reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
  return { features, validUntil };
}

/**
 * The rights Today draws with: the schools' when `schoolIds` is not empty, else the learner's
 * own. A school whose answer is refused simply adds nothing; none answering at all is `null`.
 */
export async function getLearnerEntitlements(schoolIds: readonly string[]): Promise<Entitlements | null> {
  if (schoolIds.length === 0) return getEntitlements();
  const answers = await Promise.all(schoolIds.map((id) => getEntitlements(id)));
  return mergeEntitlements(answers.filter((e): e is Entitlements => e !== null));
}

/** Rights past `validUntil` may have changed: AI that needs the network reads them as none. */
export function isExpired(e: Entitlements, now: Date = new Date()): boolean {
  return Date.parse(e.validUntil) <= now.getTime();
}
