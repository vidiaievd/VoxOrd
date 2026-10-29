import { apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';

/* ─────────────────────────────────────────────────────────────────────────
 * The learner's notification feed (mobile redesign 06, step 1).
 *
 * notification-service `GET /api/v1/notifications` (JWT) answers with the type and its
 * `templateData`, never with text: the phone words each item in the reader's language from
 * `notifications.type.*` (spec §13 q1). So the model below keeps the facts (`params`) rather
 * than the spec's ready `title` — a cached item reads right after a language switch.
 *
 * The server's types are not the spec's (decision D5). What maps today:
 *   ATTEMPT_REVIEWED      → submission_passed / submission_returned (by `outcome`; the engine
 *                           has two verdicts, so the spec's `submission_failed` never occurs)
 *   LESSON_REMINDER       → class_scheduled (informational, no target)
 *   ENROLLMENT_APPROVED   → enrollment_approved   ┐ the learner's own school news, under
 *   ENROLLMENT_REJECTED   → enrollment_rejected   │ «Courses & school», no target until the
 *   GROUP_ASSIGNED        → group_joined          ┘ phone has a school screen (owner, 2026-10-29)
 *   LESSON_CHANGED        → class_changed (moved / cancelled / back on; backend step 6c), no target
 *   ASSIGNMENT_NEW        → assignment_new (a teacher gave the learner something to do; backend
 *                           step 6b). No target yet — the phone has no assignment screen, and
 *                           Today's assignment block opens nothing either
 *   AI_REVIEWED           → ai_reviewed (a model's verdict closed the work — at once, or at the
 *                           school's term; backend step 6a). Never a summary: the review's text
 *                           stays in the engine, so the row says the outcome and the mark
 * Anything else — teacher and admin types, the teacher's nudge (STUDY_REMINDER, hidden by the
 * owner's decision), a type added upstream later, an outcome nobody knows — is dropped, with a
 * `__DEV__` log. The spec's `ai_reviewed`, `assignment_new`, `class_changed` The spec's `materials_new` has no event behind it
 * (GROUP_ASSIGNED is not it — see the plan's type table).
 * ────────────────────────────────────────────────────────────────────── */

export type NotificationType =
  | 'submission_passed'
  | 'submission_returned'
  | 'class_scheduled'
  | 'enrollment_approved'
  | 'enrollment_rejected'
  | 'group_joined'
  | 'ai_reviewed'
  | 'assignment_new'
  | 'class_changed';

/** The screen's segment (Notifications §4.3). */
export type NotificationFilter = 'all' | 'work' | 'course';

export type NotificationTarget =
  | { kind: 'submission'; submissionId: string; exerciseId: string }
  | { kind: 'none' };

/** What a reviewed piece of work says about itself — the row builds its lines from these. */
export interface SubmissionParams {
  /** The exercise as it read when started, else its module or course; null on older work. */
  title: string | null;
  courseTitle: string | null;
  /** 0–100, an integer as the engine marks it; null when the work has no mark. */
  score: number | null;
  /** A teacher wrote something — in general or on a single sentence. */
  hasComment: boolean;
  approvedItems: number | null;
  totalItems: number | null;
}

/** A model's verdict — the submission's facts plus which way it went (one type, two outcomes). */
export interface AiReviewParams extends SubmissionParams {
  passed: boolean;
}

export type AssignmentKind =
  | 'LESSON'
  | 'CONTAINER'
  | 'VOCABULARY_LIST'
  | 'GRAMMAR_RULE'
  | 'EXERCISE';

export interface AssignmentParams {
  /** As content-service called it when it was assigned; null on older rows. */
  title: string | null;
  /** null when the server names a kind the phone does not know. */
  kind: AssignmentKind | null;
  /** ISO 8601 */
  dueAt: string | null;
}

export interface ClassParams {
  /** YYYY-MM-DD, the school's calendar day. */
  date: string;
  /** HH:MM */
  startTime: string;
  endTime: string | null;
  isExam: boolean;
}

export interface ClassChangeParams {
  change: 'moved' | 'cancelled' | 'restored';
  /** YYYY-MM-DD and HH:MM — when it is now (when it was, if cancelled). */
  date: string;
  startTime: string | null;
  isExam: boolean;
  /** Where a moved lesson was; null otherwise. */
  previousDate: string | null;
  previousStartTime: string | null;
}

export interface SchoolParams {
  schoolName: string;
  /** Only on `group_joined`. */
  groupName: string | null;
}

interface Base {
  id: string;
  /** ISO 8601 */
  createdAt: string;
  read: boolean;
}

export type NotificationItem = Base &
  (
    | {
        type: 'submission_passed' | 'submission_returned';
        params: SubmissionParams;
        target: Extract<NotificationTarget, { kind: 'submission' }>;
      }
    | {
        type: 'ai_reviewed';
        params: AiReviewParams;
        target: Extract<NotificationTarget, { kind: 'submission' }>;
      }
    | { type: 'assignment_new'; params: AssignmentParams; target: { kind: 'none' } }
    | { type: 'class_scheduled'; params: ClassParams; target: { kind: 'none' } }
    | { type: 'class_changed'; params: ClassChangeParams; target: { kind: 'none' } }
    | {
        type: 'enrollment_approved' | 'enrollment_rejected' | 'group_joined';
        params: SchoolParams;
        target: { kind: 'none' };
      }
  );

export interface NotificationsPage {
  items: NotificationItem[];
  /** The id to ask for the next page with; null on the last one. */
  nextCursor: string | null;
  /**
   * Unread across the whole feed, as the server counts it — hidden types included, so the
   * badge subtracts `hiddenUnreadIds` it has seen.
   */
  unreadCount: number;
  /** Unread rows of this page the phone does not show (the teacher's nudge, a teacher type). */
  hiddenUnreadIds: string[];
}

const FILTER_OF: Record<
  NotificationType,
  Exclude<NotificationFilter, 'all'>
> = {
  submission_passed: 'work',
  submission_returned: 'work',
  ai_reviewed: 'work',
  assignment_new: 'work',
  class_scheduled: 'course',
  class_changed: 'course',
  enrollment_approved: 'course',
  enrollment_rejected: 'course',
  group_joined: 'course',
};

/** Whether an item belongs under a segment; the segments filter the cache on the phone. */
export function matchesFilter(
  item: Pick<NotificationItem, 'type'>,
  filter: NotificationFilter,
): boolean {
  return filter === 'all' || FILTER_OF[item.type] === filter;
}

const PATH = '/api/v1/notifications';
/** The service's page ceiling. */
export const PAGE_SIZE = 50;

const DATE = /^\d{4}-\d{2}-\d{2}/;
const TIME = /^\d{2}:\d{2}/;

function isIsoDate(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function skip(reason: string, raw: unknown): null {
  if (__DEV__) console.log(`[notifications] dropped (${reason})`, raw);
  return null;
}

/** The facts both a teacher's and a model's verdict carry; null when the row is not one. */
function verdict(data: Record<string, unknown>) {
  const outcome = data.outcome;
  if (outcome !== 'approved' && outcome !== 'returned')
    return skip(`outcome ${String(outcome)}`, data);
  if (!isString(data.attemptId) || !isString(data.exerciseId))
    return skip('attempt without ids', data);
  const path = isRecord(data.exercisePath) ? data.exercisePath : null;
  const courseTitle = stringOrNull(path?.course);
  const params: SubmissionParams = {
    title:
      stringOrNull(path?.exercise) ?? stringOrNull(path?.module) ?? courseTitle,
    courseTitle,
    score: numberOrNull(data.score),
    // Older rows (before plan 47) carry only `comment`; a model's never has one.
    hasComment: data.hasComment === true || isString(data.comment),
    approvedItems: numberOrNull(data.approvedItems),
    totalItems: numberOrNull(data.totalItems),
  };
  const target = {
    kind: 'submission' as const,
    submissionId: data.attemptId,
    exerciseId: data.exerciseId,
  };
  return { passed: outcome === 'approved', params, target };
}

function submission(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  const v = verdict(data);
  if (!v) return null;
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: v.passed ? 'submission_passed' : 'submission_returned',
    params: v.params,
    target: v.target,
  };
  return item;
}

function aiReview(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  const v = verdict(data);
  if (!v) return null;
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: 'ai_reviewed',
    params: { ...v.params, passed: v.passed },
    target: v.target,
  };
  return item;
}

const ASSIGNMENT_KINDS: readonly string[] = [
  'LESSON',
  'CONTAINER',
  'VOCABULARY_LIST',
  'GRAMMAR_RULE',
  'EXERCISE',
];

function assignment(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  if (!isString(data.assignmentId)) return skip('assignment without an id', data);
  const title = stringOrNull(data.contentTitle);
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: 'assignment_new',
    params: {
      title: title && title.trim() ? title : null,
      kind: ASSIGNMENT_KINDS.includes(data.contentType as string)
        ? (data.contentType as AssignmentKind)
        : null,
      dueAt: isIsoDate(data.dueAt) ? data.dueAt : null,
    },
    target: { kind: 'none' },
  };
  return item;
}

function lesson(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  if (
    !isString(data.date) ||
    !DATE.test(data.date) ||
    !isString(data.startTime) ||
    !TIME.test(data.startTime)
  ) {
    return skip('lesson without a time', data);
  }
  const endTime =
    isString(data.endTime) && TIME.test(data.endTime)
      ? data.endTime.slice(0, 5)
      : null;
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: 'class_scheduled',
    params: {
      date: data.date.slice(0, 10),
      startTime: data.startTime.slice(0, 5),
      endTime,
      isExam: data.isExam === true,
    },
    target: { kind: 'none' },
  };
  return item;
}

const CHANGES: Record<string, ClassChangeParams['change']> = {
  moved: 'moved',
  cancelled: 'cancelled',
  // The server's word for a cancellation undone.
  scheduled: 'restored',
};

function timeOrNull(value: unknown): string | null {
  return isString(value) && TIME.test(value) ? value.slice(0, 5) : null;
}

function dayOrNull(value: unknown): string | null {
  return isString(value) && DATE.test(value) ? value.slice(0, 10) : null;
}

function classChange(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  const change = isString(data.change) ? CHANGES[data.change] : undefined;
  if (!change) return skip(`lesson change ${String(data.change)}`, data);
  const date = dayOrNull(data.date);
  if (!date) return skip('lesson change without a day', data);
  const previousDate = change === 'moved' ? dayOrNull(data.previousDate) : null;
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: 'class_changed',
    params: {
      change,
      date,
      startTime: timeOrNull(data.startTime),
      isExam: data.isExam === true,
      previousDate,
      previousStartTime: previousDate ? timeOrNull(data.previousStartTime) : null,
    },
    target: { kind: 'none' },
  };
  return item;
}

function school(
  type: 'enrollment_approved' | 'enrollment_rejected' | 'group_joined',
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  if (!isString(data.schoolName)) return skip('school without a name', data);
  const groupName = stringOrNull(data.groupName);
  if (type === 'group_joined' && groupName === null)
    return skip('group without a name', data);
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type,
    params: {
      schoolName: data.schoolName,
      groupName: type === 'group_joined' ? groupName : null,
    },
    target: { kind: 'none' },
  };
  return item;
}

/** One feed row in the phone's model; null when it is not one the learner is shown. */
export function adaptNotification(raw: unknown): NotificationItem | null {
  if (
    !isRecord(raw) ||
    !isString(raw.id) ||
    !isString(raw.type) ||
    !isIsoDate(raw.createdAt)
  ) {
    return skip('malformed row', raw);
  }
  const data = isRecord(raw.templateData) ? raw.templateData : {};
  const read = raw.isRead === true;
  switch (raw.type) {
    case 'ATTEMPT_REVIEWED':
      return submission(raw.id, raw.createdAt, read, data);
    case 'LESSON_CHANGED':
      return classChange(raw.id, raw.createdAt, read, data);
    case 'ASSIGNMENT_NEW':
      return assignment(raw.id, raw.createdAt, read, data);
    case 'AI_REVIEWED':
      return aiReview(raw.id, raw.createdAt, read, data);
    case 'LESSON_REMINDER':
      return lesson(raw.id, raw.createdAt, read, data);
    case 'ENROLLMENT_APPROVED':
      return school('enrollment_approved', raw.id, raw.createdAt, read, data);
    case 'ENROLLMENT_REJECTED':
      return school('enrollment_rejected', raw.id, raw.createdAt, read, data);
    case 'GROUP_ASSIGNED':
      return school('group_joined', raw.id, raw.createdAt, read, data);
    default:
      return skip(`type ${raw.type}`, raw.type);
  }
}

/** A page of the feed; null when the answer is not one. Rows the phone does not show are dropped. */
export function parseNotificationsPage(raw: unknown): NotificationsPage | null {
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.items) ||
    typeof raw.unreadCount !== 'number'
  )
    return null;
  const items: NotificationItem[] = [];
  const hiddenUnreadIds: string[] = [];
  for (const row of raw.items) {
    const item = adaptNotification(row);
    if (item) items.push(item);
    else if (isRecord(row) && isString(row.id) && row.isRead === false)
      hiddenUnreadIds.push(row.id);
  }
  return {
    items,
    nextCursor: stringOrNull(raw.nextCursor),
    unreadCount: Math.max(0, raw.unreadCount),
    hiddenUnreadIds,
  };
}

/**
 * One page, newest first. Throws on a network error or a refusal — the store keeps its cache
 * either way; a malformed answer throws too, so it is never cached as an empty feed.
 */
export async function getNotifications(
  cursor?: string | null,
): Promise<NotificationsPage> {
  const raw = await apiClient.get<unknown>(PATH, {
    query: { limit: PAGE_SIZE, cursor: cursor ?? undefined },
  });
  const page = parseNotificationsPage(raw);
  if (!page) throw new Error('notifications: malformed page');
  return page;
}

/** Idempotent on the server; 204, no body. */
export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post<void>(`${PATH}/${encodeURIComponent(id)}/read`);
}

/**
 * Everything unread on the server, including what arrived after the screen loaded — the
 * service takes no `before` yet (backend step 6d). 204, no body.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post<void>(`${PATH}/read-all`);
}
