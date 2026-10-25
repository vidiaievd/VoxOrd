import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';
import type { ProvisionalVerdict } from './exercises';

/* ─────────────────────────────────────────────────────────────────────────
 * The learner's work that went to a reviewer (mobile redesign 02, step 5).
 *
 * exercise-engine `GET /api/v1/attempts/mine` (JWT, the learner from the token — plan 02
 * step 4): the rows the web reads from `internal/attempts/review/mine` through its BFF. Never
 * the answer itself — only what became of it. Status is `pending | returned | approved`: the
 * engine has two verdicts, so the spec's «Частично» / «Не зачтено» never occur.
 *
 * At a school with a model-first policy (plan 80) a model's verdict comes first: on a
 * `pending` row as `provisional` (a teacher will still read it), and on a closed one as a
 * model's decision with `acceptedAtTerm` when the term ran out with no teacher's answer.
 *
 * Teachers' names come from user-profile-service `GET /api/v1/profiles?userIds=`, as the
 * web's BFF joins them; a name that cannot be read leaves the review without one.
 * ────────────────────────────────────────────────────────────────────── */

export type SubmissionStatus = 'pending' | 'returned' | 'approved';

export interface SubmissionDecision {
  verdict: 'approved' | 'returned';
  /** A teacher, or a model reviewing a learner nobody reviews (plan 79) — no person to name. */
  by: 'teacher' | 'ai';
  byUserId: string | null;
  /** The teacher's display name; null for a model, or when the directory did not answer. */
  byName: string | null;
  /** ISO 8601 — when the verdict was delivered. */
  at: string;
  comment: string | null;
  /** The teacher sent or edited a model's draft (plan 79 `review_draft`). */
  aiDrafted: boolean;
  /** A model's verdict at a school that counted by itself at the term (plan 80). */
  acceptedAtTerm: boolean;
}

export interface Submission {
  attemptId: string;
  exerciseId: string;
  templateCode: string;
  /** What to call the work: the exercise as it read when started, else its module or course. */
  title: string | null;
  courseTitle: string | null;
  containerId: string | null;
  schoolId: string | null;
  /** ISO 8601 */
  submittedAt: string;
  status: SubmissionStatus;
  attemptNo: number;
  decision: SubmissionDecision | null;
  /** A model's verdict waiting for the school's teacher (plan 80); only on `pending` rows. */
  provisional: ProvisionalVerdict | null;
  canResubmit: boolean;
}

/** What Today keeps of the list: the newest page, and how much is waiting for a reviewer. */
export interface MySubmissions {
  items: Submission[];
  pendingCount: number;
  /** The waiting count reached the page ceiling: there may be more than `pendingCount`. */
  pendingCapped: boolean;
}

const PATH = '/api/v1/attempts/mine';
/** Newest submissions read for the feedback card; a review lands on old work too, so not 1. */
export const RECENT_PAGE = 50;
/** The service's page ceiling — the waiting count is exact below it. */
export const PENDING_PAGE = 100;
/** A review older than this is not news on Today. */
export const FEEDBACK_HORIZON_DAYS = 14;

const STATUSES: readonly string[] = ['pending', 'returned', 'approved'];

function isIsoDate(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function parseDecision(raw: unknown): SubmissionDecision | null | undefined {
  if (raw === null) return null;
  if (
    !isRecord(raw) ||
    (raw.verdict !== 'approved' && raw.verdict !== 'returned') ||
    (raw.by !== 'teacher' && raw.by !== 'ai') ||
    !isIsoDate(raw.at)
  ) {
    return undefined;
  }
  return {
    verdict: raw.verdict,
    by: raw.by,
    byUserId: stringOrNull(raw.byUserId),
    byName: null,
    at: raw.at,
    comment: stringOrNull(raw.comment),
    aiDrafted: raw.aiDrafted === true,
    acceptedAtTerm: raw.acceptedAtTerm === true,
  };
}

/** A model's provisional verdict; null for anything else — the row is then simply waiting. */
export function parseProvisional(raw: unknown): ProvisionalVerdict | null {
  if (!isRecord(raw) || (raw.outcome !== 'approved' && raw.outcome !== 'returned') || !isIsoDate(raw.at)) {
    return null;
  }
  return {
    outcome: raw.outcome,
    comment: stringOrNull(raw.comment),
    at: raw.at,
    countsAt: isIsoDate(raw.countsAt) ? raw.countsAt : null,
  };
}

/** One row, field by field; null when it is not a submission (the row is dropped). */
export function parseSubmission(raw: unknown): Submission | null {
  if (
    !isRecord(raw) ||
    !isString(raw.attemptId) ||
    !isString(raw.exerciseId) ||
    !isString(raw.templateCode) ||
    !isIsoDate(raw.submittedAt) ||
    !isString(raw.status) ||
    !STATUSES.includes(raw.status)
  ) {
    return null;
  }
  const decision = parseDecision(raw.decision ?? null);
  if (decision === undefined) return null;
  const path = isRecord(raw.exercisePath) ? raw.exercisePath : null;
  const courseTitle = stringOrNull(path?.course);
  return {
    attemptId: raw.attemptId,
    exerciseId: raw.exerciseId,
    templateCode: raw.templateCode,
    title: stringOrNull(path?.exercise) ?? stringOrNull(path?.module) ?? courseTitle,
    courseTitle,
    containerId: stringOrNull(raw.containerId),
    schoolId: stringOrNull(raw.schoolId),
    submittedAt: raw.submittedAt,
    status: raw.status as SubmissionStatus,
    attemptNo: typeof raw.attemptNo === 'number' ? raw.attemptNo : 1,
    decision,
    provisional: raw.status === 'pending' ? parseProvisional(raw.provisional) : null,
    canResubmit: raw.canResubmit === true,
  };
}

/** A page of the list; null when the answer is not one. A malformed row alone is dropped. */
export function parseSubmissionsPage(raw: unknown): Submission[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  return raw.items.map(parseSubmission).filter((s): s is Submission => s !== null);
}

/** Display names by user id; whatever cannot be read is simply absent. */
async function teacherNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return names;
  try {
    const raw = await apiClient.get<unknown>('/api/v1/profiles', { query: { userIds: ids.join(',') } });
    if (!Array.isArray(raw)) return names;
    for (const p of raw) {
      if (isRecord(p) && isString(p.userId) && isString(p.displayName)) names.set(p.userId, p.displayName);
    }
  } catch {
    // The directory blinked: reviews without names, not no reviews.
  }
  return names;
}

/**
 * The newest page and the waiting count, with teachers' names. Throws when the engine is out
 * of reach, so a cached answer stays (offline: «show the cache»); a refusal or a malformed
 * answer is `null` — nothing to show.
 */
export async function getMySubmissions(): Promise<MySubmissions | null> {
  let recent: Submission[] | null;
  let pending: Submission[] | null;
  try {
    const [recentRaw, pendingRaw] = await Promise.all([
      apiClient.get<unknown>(PATH, { query: { limit: RECENT_PAGE } }),
      apiClient.get<unknown>(PATH, { query: { status: 'pending', limit: PENDING_PAGE } }),
    ]);
    recent = parseSubmissionsPage(recentRaw);
    pending = parseSubmissionsPage(pendingRaw);
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
  if (!recent || !pending) return null;

  const names = await teacherNames(
    recent.flatMap((s) => (s.decision?.by === 'teacher' && s.decision.byUserId ? [s.decision.byUserId] : [])),
  );
  const items = recent.map((s) =>
    s.decision?.byUserId
      ? { ...s, decision: { ...s.decision, byName: names.get(s.decision.byUserId) ?? null } }
      : s,
  );
  return { items, pendingCount: pending.length, pendingCapped: pending.length >= PENDING_PAGE };
}

/**
 * The review Today leads with: the most recently *delivered* verdict within the horizon —
 * by when it was given, not when the work was handed in, since a teacher may answer old work
 * last. `by` narrows to a teacher's (block 6) or a model's (block 6b). Applied at render, so
 * a cached list ages out on its own.
 */
export function latestReviewed(
  items: readonly Submission[],
  by: SubmissionDecision['by'],
  now: Date = new Date(),
): Submission | null {
  const since = now.getTime() - FEEDBACK_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  let latest: Submission | null = null;
  for (const s of items) {
    if (s.status === 'pending' || !s.decision || s.decision.by !== by) continue;
    const at = Date.parse(s.decision.at);
    if (at < since) continue;
    if (!latest || at > Date.parse(latest.decision!.at)) latest = s;
  }
  return latest;
}

/**
 * When the school last told the learner something about this work, or null: a teacher's
 * verdict, a model's verdict on the school's behalf (plan 80 — at once under sampling, or at
 * the term), or a model's provisional one while the teacher is awaited. A model's verdict on
 * the work of a learner nobody reviews is not the school's and has no place here.
 */
function schoolFeedbackAt(s: Submission): string | null {
  // A row cached before plan 80 has no `provisional` at all.
  if (s.status === 'pending') return s.provisional?.at ?? null;
  if (!s.decision) return null;
  if (s.decision.by === 'ai' && s.schoolId === null) return null;
  return s.decision.at;
}

/**
 * Block 6's row: what the school last said, within the horizon — `latestReviewed` for a
 * teacher, widened to a model's word at a school with a model-first policy (plan 80), which
 * the card then labels as the model's.
 */
export function latestSchoolFeedback(items: readonly Submission[], now: Date = new Date()): Submission | null {
  const since = now.getTime() - FEEDBACK_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  let latest: Submission | null = null;
  let latestAt = -Infinity;
  for (const s of items) {
    const raw = schoolFeedbackAt(s);
    if (raw === null) continue;
    const at = Date.parse(raw);
    if (at < since || at <= latestAt) continue;
    latest = s;
    latestAt = at;
  }
  return latest;
}
