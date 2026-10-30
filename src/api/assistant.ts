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
 *
 * Streaming (step 6, after plan 83 step 9): with `onDraft` a turn is asked with `?stream=1`
 * and the blocks' text is shown as it is written. That text is unchecked — it stands only once
 * the closing `answer` event arrives, which replaces it whole; a turn that ends any other way
 * drops it, exactly as a silence.
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

/** A block of an answer still being written: its text so far, its type once known. */
export interface DraftBlock {
  type: 'text' | 'example' | null;
  text: string;
}

export type AssistDraft = DraftBlock[];

/** What a streamed turn sends before it ends (plan 83 step 9). */
export type StreamEvent =
  | { kind: 'delta'; block: number; type: 'text' | 'example' | null; text: string }
  /** The model starts over: drop every block shown. */
  | { kind: 'reset' }
  | { kind: 'answer'; raw: unknown }
  | { kind: 'refused'; reason: AssistReason | null }
  | { kind: 'unavailable' };

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

/* ── streaming ───────────────────────────────────────────────────────── */

/** A block index past this is not a block of an answer — the delta is dropped. */
const DRAFT_MAX_BLOCKS = 50;

/**
 * Server-sent events out of text that arrives in pieces cut anywhere — mid-line, mid-frame.
 * Only the events plan 83 names are passed on; comments, unknown events and frames whose data
 * is not JSON are dropped.
 */
export class AssistEventReader {
  private buffer = '';

  feed(piece: string): StreamEvent[] {
    this.buffer += piece.replace(/\r\n?/g, '\n');
    const events: StreamEvent[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end !== -1) {
      const event = parseFrame(this.buffer.slice(0, end));
      if (event) events.push(event);
      this.buffer = this.buffer.slice(end + 2);
      end = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

function parseFrame(frame: string): StreamEvent | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data.join('\n'));
  } catch {
    return null;
  }
  switch (name) {
    case 'delta': {
      if (!isRecord(payload) || !isString(payload.text)) return null;
      const block = payload.block;
      if (!Number.isInteger(block) || (block as number) < 0 || (block as number) >= DRAFT_MAX_BLOCKS) {
        return null;
      }
      const type = payload.type === 'text' || payload.type === 'example' ? payload.type : null;
      return { kind: 'delta', block: block as number, type, text: payload.text };
    }
    case 'reset':
      return { kind: 'reset' };
    case 'answer':
      return { kind: 'answer', raw: payload };
    case 'refused':
      return { kind: 'refused', reason: parseReason(isRecord(payload) ? payload.reason : null) };
    case 'unavailable':
      return { kind: 'unavailable' };
    default:
      return null;
  }
}

/** The draft after one delta or reset; the same draft for any other event. */
export function applyToDraft(draft: AssistDraft, event: StreamEvent): AssistDraft {
  if (event.kind === 'reset') return [];
  if (event.kind !== 'delta') return draft;
  const next = draft.slice();
  while (next.length <= event.block) next.push({ type: null, text: '' });
  const current = next[event.block];
  next[event.block] = { type: event.type ?? current.type, text: current.text + event.text };
  return next;
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

/** How a failed message reads: the server's refusal, a rate limit, no answer, or no server. */
function failureOutcome(e: unknown): SendOutcome {
  if (!(e instanceof ApiError)) return { kind: 'silent' };
  if (e.code === 'NETWORK_ERROR') return { kind: 'unreachable' };
  if (e.status === 409 || e.status === 403) {
    return { kind: 'refused', reason: parseReason(isRecord(e.body) ? e.body.reason : null) };
  }
  if (e.status === 429) return { kind: 'rate_limited' };
  // A timeout, 503 «every model failed», anything else: the assistant did not answer.
  return { kind: 'silent' };
}

/**
 * One turn. Never throws: every way it can end is an outcome the screen draws.
 *
 * With `onDraft` the turn is streamed: `onDraft` gets the answer as written so far after each
 * piece (an empty draft when the model starts over). The outcome is the same as without it —
 * the closing `answer` read as a whole answer, or a refusal / silence that voids the draft.
 * A server that answers without streaming (a refusal before any text, say) is read as JSON.
 */
export async function sendMessage(
  context: AssistContext,
  history: readonly AssistTurn[],
  message: string,
  onDraft?: (draft: AssistDraft) => void,
): Promise<SendOutcome> {
  const body = {
    context: contextFields(context),
    history: historyToSend(history),
    message: message.trim().slice(0, MESSAGE_MAX),
  };
  let raw: unknown;
  let end: SendOutcome | null = null;
  try {
    if (!onDraft) {
      raw = await apiClient.post(MESSAGES_PATH, body, { timeoutMs: MESSAGE_TIMEOUT_MS });
    } else {
      const reader = new AssistEventReader();
      let draft: AssistDraft = [];
      const result = await apiClient.stream(MESSAGES_PATH, {
        method: 'POST',
        body,
        query: { stream: 1 },
        // Between rounds of the server's tool loop nothing comes for a while.
        idleTimeoutMs: MESSAGE_TIMEOUT_MS,
        onText: (piece) => {
          for (const event of reader.feed(piece)) {
            if (end) return;
            if (event.kind === 'answer') {
              const answer = parseAnswer(event.raw);
              end = answer ? { kind: 'answer', answer } : { kind: 'silent' };
            } else if (event.kind === 'refused') {
              end = { kind: 'refused', reason: event.reason };
            } else if (event.kind === 'unavailable') {
              end = { kind: 'silent' };
            } else {
              draft = applyToDraft(draft, event);
              onDraft(draft);
            }
          }
        },
      });
      // A stream that stops without its closing event answered nothing.
      if (result.streamed) return end ?? { kind: 'silent' };
      raw = result.body;
    }
  } catch (e) {
    // Whatever the stream closed with stands even if the connection broke after it.
    return end ?? failureOutcome(e);
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
