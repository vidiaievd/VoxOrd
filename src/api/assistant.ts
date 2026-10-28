import { ApiError, apiClient } from './client';
import { isRecord, isString, stringOrNull } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * The learner's assistant (mobile redesign 03, step 1).
 *
 * ai-service `ai/assist/*` and `ai/usage/me`; the contract is platform plan 83 §3, copied here
 * by hand. The server decides who pays for a question from its context (a school's course is
 * the school's, a free question is the learner's own — 83 Q3), so whether the assistant is
 * open is always asked of `availability`, never read off the learner's own entitlements.
 *
 * Silence instead of invention (plan 48 §6.4): an answer this file cannot read in full is
 * treated as no answer at all — the screen says the assistant did not answer, it never shows
 * a half-parsed reply. Fields are copied one by one, so nothing added upstream reaches the
 * screen by inheritance.
 *
 * The conversation lives on the phone (83 Q1 = A): `history` is sent with every message and
 * the server keeps nothing between turns.
 * ────────────────────────────────────────────────────────────────────── */

const AVAILABILITY_PATH = '/api/v1/ai/assist/availability';
const MESSAGES_PATH = '/api/v1/ai/assist/messages';
const FEEDBACK_PATH = '/api/v1/ai/assist/feedback';
const USAGE_PATH = '/api/v1/ai/usage/me';

/** As long as the server takes them (83 §3). */
export const MESSAGE_MAX = 1000;
export const HISTORY_MAX_TURNS = 10;
export const HISTORY_MAX_CHARS = 4000;
export const FEEDBACK_REASON_MAX = 500;

/**
 * The model reads tools and calls them in a loop on the server; a turn takes longer than a
 * plain read. Past this the phone stops waiting and offers a retry.
 */
const MESSAGE_TIMEOUT_MS = 60000;

/** What a question is about. `free` — no course: the learner's own plan pays (83 Q3). */
export type AssistContext =
  | { kind: 'free' }
  | { kind: 'unit'; courseId: string; unitId: string }
  | { kind: 'submission'; attemptId: string; exerciseId: string; courseId?: string }
  | { kind: 'class'; lessonId: string; courseId?: string }
  | { kind: 'word'; lemma: string; courseId?: string };

export type AssistReason = 'no_key' | 'policy' | 'quota' | 'disabled' | 'no_binding';

export interface AssistAvailability {
  available: boolean;
  /** Why not; null when available or when the server named no reason this app knows. */
  reason: AssistReason | null;
}

export interface AssistBlock {
  type: 'text' | 'example';
  text: string;
  /** Ranges of `text` to stress, `[start, end)` in UTF-16 units, in order, not overlapping. */
  emphasis: Array<[number, number]>;
}

export type AssistCitationKind = 'grammar_rule' | 'lesson' | 'vocabulary_item' | 'unit';

export interface AssistCitation {
  kind: AssistCitationKind;
  id: string;
  title: string;
  unitId: string | null;
  courseId: string | null;
}

export type AssistSuggestion =
  | { kind: 'ask'; text: string }
  | { kind: 'add_word'; lemma: string; translation: string | null }
  | { kind: 'open'; target: AssistCitation };

export interface AssistAnswer {
  /** The ledger's id of this turn — what feedback names. */
  callId: string;
  blocks: AssistBlock[];
  citations: AssistCitation[];
  suggestions: AssistSuggestion[];
}

export interface AssistTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type SendOutcome =
  | { kind: 'answer'; answer: AssistAnswer }
  /** 409 (gated, refused) or 403 (not this learner's course): the assistant is closed here. */
  | { kind: 'refused'; reason: AssistReason | null }
  /** 429: too many questions in a short while. */
  | { kind: 'rate_limited' }
  /** 503, any other server failure, a timeout or an answer that does not read: say nothing. */
  | { kind: 'silent' }
  /** The server was not reached. */
  | { kind: 'unreachable' };

export interface AiUsage {
  feature: string;
  /** Credits used this period; a decimal string, never a float. */
  used: string;
  /** Credits per period; null = unmetered. */
  total: string | null;
  periodEnd: string;
}

const REASONS: readonly AssistReason[] = ['no_key', 'policy', 'quota', 'disabled', 'no_binding'];
const CITATION_KINDS: readonly AssistCitationKind[] = [
  'grammar_rule',
  'lesson',
  'vocabulary_item',
  'unit',
];

function parseReason(value: unknown): AssistReason | null {
  return REASONS.find((r) => r === value) ?? null;
}

/** The context as query/body fields — only the ones its kind carries. */
export function contextFields(context: AssistContext): Record<string, string> {
  const fields: Record<string, string> = { kind: context.kind };
  for (const [key, value] of Object.entries(context)) {
    if (key !== 'kind' && typeof value === 'string' && value !== '') fields[key] = value;
  }
  return fields;
}

/**
 * One string per context, for caches and the thread store: the kind and its ids in a fixed
 * order, so the same context always lands on the same thread.
 */
export function contextKey(context: AssistContext): string {
  const fields = contextFields(context);
  const ids = Object.keys(fields)
    .filter((k) => k !== 'kind')
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  return [context.kind, ...ids].join(':');
}

/* ── parsing ─────────────────────────────────────────────────────────── */

function parseEmphasis(value: unknown, text: string): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  const ranges: Array<[number, number]> = [];
  let floor = 0;
  for (const range of value) {
    if (!Array.isArray(range) || range.length !== 2) continue;
    const [start, end] = range;
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    // A range off the text or across the previous one stresses nothing rather than garbling it.
    if (start < floor || end <= start || end > text.length) continue;
    ranges.push([start, end]);
    floor = end;
  }
  return ranges;
}

function parseBlock(raw: unknown): AssistBlock | null {
  if (!isRecord(raw) || !isString(raw.text) || raw.text.trim() === '') return null;
  if (raw.type !== 'text' && raw.type !== 'example') return null;
  return { type: raw.type, text: raw.text, emphasis: parseEmphasis(raw.emphasis, raw.text) };
}

/** A citation this app has no screen for, or one without an id or a title, is dropped. */
export function parseCitation(raw: unknown): AssistCitation | null {
  if (!isRecord(raw) || !isString(raw.id) || raw.id === '' || !isString(raw.title)) return null;
  const kind = CITATION_KINDS.find((k) => k === raw.kind);
  if (!kind) return null;
  return {
    kind,
    id: raw.id,
    title: raw.title,
    unitId: stringOrNull(raw.unitId),
    courseId: stringOrNull(raw.courseId),
  };
}

function parseSuggestion(raw: unknown): AssistSuggestion | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case 'ask':
      return isString(raw.text) && raw.text.trim() !== '' ? { kind: 'ask', text: raw.text } : null;
    case 'add_word':
      return isString(raw.lemma) && raw.lemma.trim() !== ''
        ? { kind: 'add_word', lemma: raw.lemma, translation: stringOrNull(raw.translation) }
        : null;
    case 'open': {
      const target = parseCitation(raw.target);
      return target ? { kind: 'open', target } : null;
    }
    default:
      return null;
  }
}

/**
 * The answer, or null when it is not one: no `callId`, or not a single block that reads.
 * Citations and suggestions this app cannot use are dropped one by one — the answer stands
 * without them.
 */
export function parseAnswer(raw: unknown): AssistAnswer | null {
  if (!isRecord(raw) || !isString(raw.callId) || raw.callId === '') return null;
  if (!Array.isArray(raw.blocks)) return null;
  const blocks = raw.blocks.map(parseBlock).filter((b): b is AssistBlock => b !== null);
  if (blocks.length === 0) return null;
  const citations = (Array.isArray(raw.citations) ? raw.citations : [])
    .map(parseCitation)
    .filter((c): c is AssistCitation => c !== null);
  const suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
    .map(parseSuggestion)
    .filter((s): s is AssistSuggestion => s !== null);
  return { callId: raw.callId, blocks, citations, suggestions };
}

export function parseAvailability(raw: unknown): AssistAvailability | null {
  if (!isRecord(raw) || typeof raw.available !== 'boolean') return null;
  return { available: raw.available, reason: raw.available ? null : parseReason(raw.reason) };
}

export function parseUsage(raw: unknown): AiUsage | null {
  if (!isRecord(raw) || !isString(raw.feature) || !isString(raw.used)) return null;
  if (!isString(raw.periodEnd) || Number.isNaN(Date.parse(raw.periodEnd))) return null;
  if (raw.total !== null && !isString(raw.total)) return null;
  if (Number.isNaN(Number(raw.used)) || (raw.total !== null && Number.isNaN(Number(raw.total)))) {
    return null;
  }
  return { feature: raw.feature, used: raw.used, total: raw.total, periodEnd: raw.periodEnd };
}

/**
 * The turns that go out with a message: the newest ones, no more than the server takes in
 * number and in length. A turn too long to fit whole ends the history there — the server is
 * not sent half a turn.
 */
export function historyToSend(turns: readonly AssistTurn[]): AssistTurn[] {
  const sent: AssistTurn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0 && sent.length < HISTORY_MAX_TURNS; i--) {
    const turn = turns[i];
    if (chars + turn.text.length > HISTORY_MAX_CHARS) break;
    chars += turn.text.length;
    sent.unshift({ role: turn.role, text: turn.text });
  }
  return sent;
}

/* ── calls ───────────────────────────────────────────────────────────── */

/**
 * Whether the server would take a question in this context — asked without a model call.
 * Throws when the server is out of reach, so a cached answer stays; a refusal (403 — not this
 * learner's course) or an answer that does not read is «not available».
 */
export async function getAvailability(context: AssistContext): Promise<AssistAvailability> {
  try {
    const raw = await apiClient.get(AVAILABILITY_PATH, { query: contextFields(context) });
    return parseAvailability(raw) ?? { available: false, reason: null };
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return { available: false, reason: parseReason(isRecord(e.body) ? e.body.reason : null) };
  }
}

/** One turn. Never throws: every way it can end is an outcome the screen draws. */
export async function sendMessage(
  context: AssistContext,
  history: readonly AssistTurn[],
  message: string,
): Promise<SendOutcome> {
  let raw: unknown;
  try {
    raw = await apiClient.post(
      MESSAGES_PATH,
      {
        context: contextFields(context),
        history: historyToSend(history),
        message: message.trim().slice(0, MESSAGE_MAX),
      },
      { timeoutMs: MESSAGE_TIMEOUT_MS },
    );
  } catch (e) {
    if (!(e instanceof ApiError)) return { kind: 'silent' };
    if (e.code === 'NETWORK_ERROR') return { kind: 'unreachable' };
    if (e.status === 409 || e.status === 403) {
      return { kind: 'refused', reason: parseReason(isRecord(e.body) ? e.body.reason : null) };
    }
    if (e.status === 429) return { kind: 'rate_limited' };
    // A timeout, 503 «every model failed», anything else: the assistant did not answer.
    return { kind: 'silent' };
  }
  const answer = parseAnswer(raw);
  return answer ? { kind: 'answer', answer } : { kind: 'silent' };
}

/**
 * «Helpful / not helpful», once per answer. True when the server has it — a repeat (409) is
 * the first press already counted. False when it did not get there; the press is not kept.
 */
export async function sendFeedback(
  callId: string,
  helpful: boolean,
  reason?: string,
): Promise<boolean> {
  const trimmed = reason?.trim().slice(0, FEEDBACK_REASON_MAX) ?? '';
  try {
    await apiClient.post(FEEDBACK_PATH, {
      callId,
      helpful,
      ...(trimmed === '' ? {} : { reason: trimmed }),
    });
    return true;
  } catch (e) {
    return e instanceof ApiError && e.status === 409;
  }
}

/**
 * Credits the learner's own plan has spent on a feature this period (Today D3, Profile).
 * Throws when the server is out of reach, so a cached answer stays; a refusal or an answer
 * that does not read is null — nothing to show.
 */
export async function getMyAiUsage(feature: string): Promise<AiUsage | null> {
  try {
    return parseUsage(await apiClient.get(USAGE_PATH, { query: { feature } }));
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}
