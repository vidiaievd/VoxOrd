import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * The assignment a teacher gave the learner, due soonest (mobile redesign 02, step 6, block 8).
 *
 * learning-service `GET /api/v1/assignments/mine` (JWT) — the list the web's
 * `get-assigned-materials.ts` reads. It carries no titles: each is looked up from its content,
 * and one without a title is skipped, as on the web — an assignment the screen cannot name
 * is not one to put first on Today.
 * ────────────────────────────────────────────────────────────────────── */

export type AssignmentContentType = 'LESSON' | 'CONTAINER' | 'VOCABULARY_LIST' | 'GRAMMAR_RULE' | 'EXERCISE';

export interface NextAssignment {
  assignmentId: string;
  contentType: AssignmentContentType;
  contentId: string;
  title: string;
  /** ISO 8601 */
  dueAt: string;
  /** The teacher's note on the assignment. */
  notes: string | null;
}

interface RawAssignment {
  id: string;
  contentType: AssignmentContentType;
  contentId: string;
  status: string;
  dueAt: string;
  notes: string | null;
}

const PATH = '/api/v1/assignments/mine';
/** How many of the soonest are tried for a title before Today gives up on the block. */
const TITLE_TRIES = 5;

const TITLE_PATH: Record<AssignmentContentType, (id: string) => string> = {
  LESSON: (id) => `/api/v1/lessons/${id}`,
  CONTAINER: (id) => `/api/v1/containers/${id}`,
  VOCABULARY_LIST: (id) => `/api/v1/vocabulary-lists/${id}`,
  GRAMMAR_RULE: (id) => `/api/v1/grammar-rules/${id}`,
  EXERCISE: (id) => `/api/v1/exercises/${id}`,
};

function isContentType(value: unknown): value is AssignmentContentType {
  return isString(value) && value in TITLE_PATH;
}

/** The list, row by row; a row that is not an assignment is dropped. Null when it is not a list. */
export function parseAssignments(raw: unknown): RawAssignment[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: RawAssignment[] = [];
  for (const a of raw) {
    if (
      !isRecord(a) ||
      !isString(a.id) ||
      !isRecord(a.contentRef) ||
      !isContentType(a.contentRef.type) ||
      !isString(a.contentRef.id) ||
      !isString(a.status) ||
      !isString(a.dueAt) ||
      Number.isNaN(Date.parse(a.dueAt))
    ) {
      continue;
    }
    rows.push({
      id: a.id,
      contentType: a.contentRef.type,
      contentId: a.contentRef.id,
      status: a.status,
      dueAt: a.dueAt,
      notes: stringOrNull(a.notes),
    });
  }
  return rows;
}

/** Still to do, soonest first. An overdue one has its own place in Notifications (plan 06). */
export function upcoming(rows: readonly RawAssignment[]): RawAssignment[] {
  return rows
    .filter((a) => a.status === 'ACTIVE')
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

async function titleOf(a: RawAssignment): Promise<string | null> {
  try {
    const content = await apiClient.get<unknown>(TITLE_PATH[a.contentType](a.contentId));
    const title = isRecord(content) ? stringOrNull(content.title) : null;
    return title && title.trim() ? title : null;
  } catch {
    return null;
  }
}

/**
 * The soonest active assignment that can be named; null when there is none. Throws when
 * learning-service is out of reach, so a cached one stays; a refusal is none.
 */
export async function getNextAssignment(): Promise<NextAssignment | null> {
  let rows: RawAssignment[] | null;
  try {
    rows = parseAssignments(await apiClient.get<unknown>(PATH));
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
  for (const a of upcoming(rows ?? []).slice(0, TITLE_TRIES)) {
    const title = await titleOf(a);
    if (title) {
      return {
        assignmentId: a.id,
        contentType: a.contentType,
        contentId: a.contentId,
        title,
        dueAt: a.dueAt,
        notes: a.notes,
      };
    }
  }
  return null;
}
