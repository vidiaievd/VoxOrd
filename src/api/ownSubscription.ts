import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * The learner's OWN plan, for the Profile card (mobile redesign 07, step 5).
 *
 * subscription-service `GET /api/v1/subscriptions/me` with no `workspaceId`: the plan the
 * learner holds as a person, apart from any school's. `api/entitlements.ts` reads the same
 * route for rights only and drops the plan on purpose; the card needs what it dropped
 * (`source`, `plan`, `subscription`, plan 07 step 3a). No billing exists (decision D2), so
 * there is no renewal and no store — only the plan's name and when a subscription ends.
 * ────────────────────────────────────────────────────────────────────── */

export interface OwnSubscription {
  /** `subscription`: a plan assigned to the learner; `free_plan`: nothing assigned. */
  source: 'subscription' | 'free_plan';
  planName: string | null;
  status: 'trial' | 'active' | null;
  /** When the subscription ends; null = open-ended, or no subscription. ISO 8601. */
  endsAt: string | null;
}

/** Field by field; null when the answer is not a subscription summary. */
export function parseOwnSubscription(raw: unknown): OwnSubscription | null {
  if (!isRecord(raw)) return null;
  if (raw.source !== 'subscription' && raw.source !== 'free_plan') return null;
  const plan = isRecord(raw.plan) ? stringOrNull(raw.plan.name) : null;
  const sub = isRecord(raw.subscription) ? raw.subscription : null;
  const status =
    sub && (sub.status === 'trial' || sub.status === 'active')
      ? sub.status
      : null;
  const endsAt =
    sub && isString(sub.periodEnd) && !Number.isNaN(Date.parse(sub.periodEnd))
      ? sub.periodEnd
      : null;
  return { source: raw.source, planName: plan, status, endsAt };
}

/**
 * Throws when the server is out of reach, so a cached card stays; a refusal or an answer that
 * does not read is null — the card is hidden.
 */
export async function getOwnSubscription(): Promise<OwnSubscription | null> {
  try {
    return parseOwnSubscription(
      await apiClient.get('/api/v1/subscriptions/me'),
    );
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}
