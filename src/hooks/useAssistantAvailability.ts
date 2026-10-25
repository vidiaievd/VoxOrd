import { useCallback } from 'react';
import {
  contextKey,
  getAvailability,
  type AssistContext,
  type AssistReason,
} from '../api/assistant';
import { getMemoryCache } from '../lib/swrCache';
import { useAuth } from './useAuth';
import { useSwrResource } from './useSwrResource';

/** How long an answer stands before it is asked again — and before a kept one stops counting. */
export const AVAILABILITY_TTL_MS = 10 * 60 * 1000;

interface CheckedAvailability {
  available: boolean;
  reason: AssistReason | null;
  checkedAt: number;
}

export interface AssistantAvailabilityState {
  /**
   * The server said yes within the last ten minutes, and the phone is online. False while it
   * is being asked, offline, or when the last answer is too old to go by.
   */
  available: boolean;
  reason: AssistReason | null;
  refresh: () => Promise<void>;
}

export function isFresh(checked: CheckedAvailability | null, now: number = Date.now()): boolean {
  return checked !== null && now - checked.checkedAt < AVAILABILITY_TTL_MS;
}

/**
 * Whether an entry to the assistant in this context is drawn. Asked of the server per context
 * (plan 03 step 3): the payer is chosen there — a school's course is the school's — so the
 * learner's own entitlements cannot answer it. Ten minutes per answer: a fresh one in memory
 * is reused without a request, so a screen of entries costs one request per context.
 */
export function useAssistantAvailability(
  context: AssistContext | null,
): AssistantAvailabilityState {
  const { status: authStatus, user, offline } = useAuth();
  const ctxKey = context ? contextKey(context) : null;
  const key =
    authStatus === 'signedIn' && user && ctxKey ? `assist-avail:${user.id}:${ctxKey}` : null;

  const loader = useCallback(async (): Promise<CheckedAvailability> => {
    const cached = key ? getMemoryCache<CheckedAvailability>(key) ?? null : null;
    if (cached && isFresh(cached)) return cached;
    const answer = await getAvailability(context as AssistContext);
    return { ...answer, checkedAt: Date.now() };
    // The context is read through its key: a new object with the same ids asks nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const { data, refresh } = useSwrResource<CheckedAvailability>(key, loader);
  const checked = key && data && isFresh(data) ? data : null;
  return {
    available: !offline && checked?.available === true,
    reason: checked && !checked.available ? checked.reason : null,
    refresh,
  };
}
