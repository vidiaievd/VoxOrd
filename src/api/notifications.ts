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
 * Anything else — teacher and admin types, the teacher's nudge (STUDY_REMINDER, hidden by the
 * owner's decision), a type added upstream later, an outcome nobody knows — is dropped, with a
 * `__DEV__` log. The spec's `ai_reviewed`, `assignment_new`, `class_changed` and
 * `materials_new` arrive with backend step 6, each with its row here.
 * ────────────────────────────────────────────────────────────────────── */

export type NotificationType =
  | 'submission_passed'
  | 'submission_returned'
  | 'class_scheduled'
  | 'enrollment_approved'
  | 'enrollment_rejected'
  | 'group_joined';

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
  /** 0..1 as the engine reports it; null when the work has no mark. */
  score: number | null;
  /** A teacher wrote something — in general or on a single sentence. */
  hasComment: boolean;
  approvedItems: number | null;
  totalItems: number | null;
}

export interface ClassParams {
  /** YYYY-MM-DD, the school's calendar day. */
  date: string;
  /** HH:MM */
  startTime: string;
  endTime: string | null;
  isExam: boolean;
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
    | { type: 'class_scheduled'; params: ClassParams; target: { kind: 'none' } }
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
  /** Unread across the whole feed, as the server counts it — the tab badge's number. */
  unreadCount: number;
}

const FILTER_OF: Record<
  NotificationType,
  Exclude<NotificationFilter, 'all'>
> = {
  submission_passed: 'work',
  submission_returned: 'work',
  class_scheduled: 'course',
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

function submission(
  id: string,
  createdAt: string,
  read: boolean,
  data: Record<string, unknown>,
) {
  const outcome = data.outcome;
  if (outcome !== 'approved' && outcome !== 'returned')
    return skip(`outcome ${String(outcome)}`, data);
  if (!isString(data.attemptId) || !isString(data.exerciseId))
    return skip('attempt without ids', data);
  const path = isRecord(data.exercisePath) ? data.exercisePath : null;
  const courseTitle = stringOrNull(path?.course);
  const item: NotificationItem = {
    id,
    createdAt,
    read,
    type: outcome === 'approved' ? 'submission_passed' : 'submission_returned',
    params: {
      title:
        stringOrNull(path?.exercise) ??
        stringOrNull(path?.module) ??
        courseTitle,
      courseTitle,
      score: numberOrNull(data.score),
      // Older rows (before plan 47) carry only `comment`.
      hasComment: data.hasComment === true || isString(data.comment),
      approvedItems: numberOrNull(data.approvedItems),
      totalItems: numberOrNull(data.totalItems),
    },
    target: {
      kind: 'submission',
      submissionId: data.attemptId,
      exerciseId: data.exerciseId,
    },
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
  return {
    items: raw.items
      .map(adaptNotification)
      .filter((n): n is NotificationItem => n !== null),
    nextCursor: stringOrNull(raw.nextCursor),
    unreadCount: Math.max(0, raw.unreadCount),
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
