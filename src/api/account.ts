import { ApiError, apiClient } from './client';
import { isRecord, isString } from './guards';

/* ─────────────────────────────────────────────────────────────────────────
 * Writes behind the Account and School screens (mobile redesign 07, step 6).
 * ────────────────────────────────────────────────────────────────────── */

/** user-profile-service `PATCH /profiles/me`: the name the learner goes by. */
export async function updateMyDisplayName(displayName: string): Promise<void> {
  await apiClient.patch('/api/v1/profiles/me', { displayName });
}

export interface AccountDeletion {
  /** When the request was made, ISO 8601. */
  requestedAt: string;
  /** The account is erased after this moment unless the learner signs in first. */
  purgeAfter: string;
}

/** Why a deletion request was refused, for the screen to say in words. */
export type DeletionRefusal = 'wrong_password' | 'contact_support' | 'locked';

/** Field by field; null when the answer is not a deletion receipt. */
export function parseAccountDeletion(raw: unknown): AccountDeletion | null {
  if (!isRecord(raw)) return null;
  if (!isString(raw.deletionRequestedAt) || !isString(raw.purgeAfter)) return null;
  return { requestedAt: raw.deletionRequestedAt, purgeAfter: raw.purgeAfter };
}

/** The refusal an `ApiError` stands for; null for anything else (network, 5xx). */
export function deletionRefusal(e: unknown): DeletionRefusal | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 403 && e.code === 'INVALID_PASSWORD') return 'wrong_password';
  if (e.status === 409 && e.code === 'CONTACT_SUPPORT') return 'contact_support';
  if (e.status === 423) return 'locked';
  return null;
}

/**
 * auth-service `DELETE /auth/me` with the password re-checked (202). Every session ends on the
 * server at once, the account is erased after the grace period. Throws `ApiError` on refusal —
 * read it with `deletionRefusal`.
 */
export async function requestAccountDeletion(password: string): Promise<AccountDeletion | null> {
  return parseAccountDeletion(
    await apiClient.request<unknown>('/api/v1/auth/me', { method: 'DELETE', body: { password } }),
  );
}

/** organization-service: a learner removes themselves from one group (the school stays). */
export async function leaveGroup(schoolId: string, groupId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/v1/schools/${schoolId}/groups/${groupId}/members/${userId}`);
}
