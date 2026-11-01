import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';
import { isLocalAttempt } from './exercises';

/* ─────────────────────────────────────────────────────────────────────────
 * «Check» before hand-in — the rehearsal with a model (platform plan 84, VoxOrd step 7).
 *
 * exercise-engine `POST /exercises/:exerciseId/attempts/:attemptId/check` and organization-
 * service `GET /schools/:id/ai-precheck`; the contract is plan 84 «Ход работ», rows 4 and 5,
 * copied here by hand. A rehearsal changes nothing: the attempt stays `in_progress`, no event
 * goes out, no card is rated and no progress moves — only the hand-in does that.
 *
 * Silence instead of invention (plan 48 §6.4): an answer this file cannot read in full is no
 * answer at all. Fields are copied one by one, so nothing added upstream reaches the screen.
 * ────────────────────────────────────────────────────────────────────── */

const checkPath = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/check`;
const settingPath = (schoolId: string) => `/api/v1/schools/${schoolId}/ai-precheck`;

/** The engine waits on a model for up to 110 s; the gateway gives it 120 (plan 84, step 5). */
const CHECK_TIMEOUT_MS = 125000;

export type FeedbackKind = 'grammar' | 'lexis' | 'spelling' | 'pronunciation' | 'fluency' | 'content';

export interface FeedbackItem {
  kind: FeedbackKind;
  original: string | null;
  suggestion: string | null;
  explanation: string;
  severity: 'minor' | 'major';
}

export interface FeedbackWord {
  text: string;
  passageIndex: number | null;
  /** 0–100; null when the provider gave no pronunciation scores. */
  accuracy: number | null;
}

/** The model's reading of the work (platform `AiFeedback`, minus what the phone does not draw). */
export interface Feedback {
  summary: string;
  items: FeedbackItem[];
  words: FeedbackWord[];
}

/** What the school's limits leave. `null` — no limit, or not read. */
export interface PrecheckRemaining {
  exercise: number | null;
  learnerChecksApprox: number | null;
}

export type PrecheckAi =
  | { status: 'ok' }
  /** `exercise_limit`, `learner_limit`, `pool_empty`, `unaskable`, `not_available`, … */
  | { status: 'refused'; reason: string }
  | { status: 'failed'; errorCode: string }
  /** `key_settles`, or why this school's learner cannot ask a model. */
  | { status: 'not_asked'; reason: string };

export interface ReadingPrompt {
  itemId: string;
  percent: number;
  passed: boolean;
}

export interface PrecheckResult {
  /** The free, key-based half (`error_correction`, `translate_*`); the template reads it. */
  selfCheck: unknown | null;
  ai: PrecheckAi;
  feedback: Feedback | null;
  /** `read_aloud`: how much of each passage the speech model heard read. */
  reading: { passPercent: number; prompts: ReadingPrompt[] } | null;
  remaining: PrecheckRemaining | null;
}

const KINDS: readonly string[] = ['grammar', 'lexis', 'spelling', 'pronunciation', 'fluency', 'content'];

function parseFeedback(raw: unknown): Feedback | null {
  if (!isRecord(raw) || !isString(raw.summary) || !Array.isArray(raw.items)) return null;
  const items: FeedbackItem[] = [];
  for (const entry of raw.items) {
    if (!isRecord(entry) || !isString(entry.explanation) || !KINDS.includes(String(entry.kind))) continue;
    items.push({
      kind: entry.kind as FeedbackKind,
      original: stringOrNull(entry.original),
      suggestion: stringOrNull(entry.suggestion),
      explanation: entry.explanation,
      severity: entry.severity === 'major' ? 'major' : 'minor',
    });
  }
  const words: FeedbackWord[] = [];
  for (const entry of Array.isArray(raw.words) ? raw.words : []) {
    if (!isRecord(entry) || !isString(entry.text)) continue;
    words.push({
      text: entry.text,
      passageIndex: typeof entry.passageIndex === 'number' ? entry.passageIndex : null,
      accuracy: typeof entry.accuracy === 'number' ? entry.accuracy : null,
    });
  }
  return { summary: raw.summary, items, words };
}

function parseAi(raw: unknown): PrecheckAi | null {
  if (!isRecord(raw)) return null;
  switch (raw.status) {
    case 'ok':
      return { status: 'ok' };
    case 'refused':
      return { status: 'refused', reason: isString(raw.reason) ? raw.reason : 'unknown' };
    case 'failed':
      return { status: 'failed', errorCode: isString(raw.errorCode) ? raw.errorCode : 'unknown' };
    case 'not_asked':
      return { status: 'not_asked', reason: isString(raw.reason) ? raw.reason : 'unknown' };
    default:
      return null;
  }
}

function parseRemaining(raw: unknown): PrecheckRemaining | null {
  if (!isRecord(raw)) return null;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null);
  return { exercise: count(raw.exercise), learnerChecksApprox: count(raw.learnerChecksApprox) };
}

function parseReading(raw: unknown): PrecheckResult['reading'] {
  if (!isRecord(raw) || typeof raw.passPercent !== 'number' || !Array.isArray(raw.prompts)) return null;
  const prompts: ReadingPrompt[] = [];
  for (const entry of raw.prompts) {
    if (!isRecord(entry) || !isString(entry.itemId) || typeof entry.percent !== 'number') continue;
    prompts.push({ itemId: entry.itemId, percent: entry.percent, passed: entry.passed === true });
  }
  return { passPercent: raw.passPercent, prompts };
}

/** Null when the answer is not a check result this app can read. */
export function parsePrecheckResult(raw: unknown): PrecheckResult | null {
  if (!isRecord(raw)) return null;
  const ai = parseAi(raw.ai);
  if (ai === null) return null;
  return {
    selfCheck: raw.selfCheck ?? null,
    ai,
    feedback: ai.status === 'ok' ? parseFeedback(raw.feedback) : null,
    reading: parseReading(raw.reading),
    remaining: parseRemaining(raw.remaining),
  };
}

/** Raised when the rehearsal cannot run at all: the attempt lives on the phone, or the reply is unreadable. */
export class PrecheckUnavailableError extends Error {
  constructor(readonly reason: 'offline' | 'unreadable') {
    super(`Check unavailable: ${reason}`);
  }
}

/**
 * Check the work in progress. `draftAnswer` is the shape a submission has. A refusal of the
 * school or the plan (403 `PRECHECK_NOT_AVAILABLE`, 503 `PRECHECK_ACCESS_UNKNOWN`) arrives as
 * the `ApiError` it is; everything the model itself can answer is a 200 with `ai.status`.
 */
export async function checkAttempt(
  exerciseId: string,
  attemptId: string,
  draftAnswer: unknown,
): Promise<PrecheckResult> {
  // An attempt started offline exists only on this phone: the server has never heard of it.
  if (isLocalAttempt(attemptId)) throw new PrecheckUnavailableError('offline');
  const result = parsePrecheckResult(
    await apiClient.post<unknown>(
      checkPath(exerciseId, attemptId),
      { draftAnswer },
      { timeoutMs: CHECK_TIMEOUT_MS },
    ),
  );
  if (result === null) throw new PrecheckUnavailableError('unreadable');
  return result;
}

export interface PrecheckSetting {
  enabled: boolean;
}

/**
 * Whether the school lets its learners rehearse. Throws only when the server is out of reach,
 * so a kept answer stays; any other failure is `null` — no rehearsal is drawn.
 */
export async function getPrecheckSetting(schoolId: string): Promise<PrecheckSetting | null> {
  try {
    const raw = await apiClient.get<unknown>(settingPath(schoolId));
    return isRecord(raw) && typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : null;
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}
