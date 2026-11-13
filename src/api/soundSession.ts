import { ApiError, apiClient } from './client';
import { isRecord } from './guards';
import { parseFeedback, type Feedback } from './precheck';

/* ─────────────────────────────────────────────────────────────────────────
 * The pronunciation session — «logopedist» (platform plan 86, steps 13.4 / 14.1; VoxOrd step 15.1).
 *
 * exercise-engine `POST /sound-sessions` → `GET :id/items` → `POST :id/takes` → `POST :id/submit`
 * and content-service `GET /sound-atoms/:atomId`. The contract is the web's `features/student/
 * pronunciation` (`types.ts`, `parse.ts`) copied here by hand; the phone reads the gateway directly.
 *
 * Silence instead of invention (plan 48 §6.4): a live session this file cannot read in full is no
 * session at all, and the screen says «try again». The engine owns every decision; refusals keep
 * their code (`SESSION_LIMIT`, `POOL_EMPTY`, `NOT_AVAILABLE`, `STALE_TAKE`, `SESSION_CLOSED`) in
 * the `ApiError` and are read with `soundRefusal`.
 * ────────────────────────────────────────────────────────────────────── */

const SESSIONS_PATH = '/api/v1/sound-sessions';

/** A take is one speech call and, on a miss, one explanation: seconds, not minutes. */
const TAKE_TIMEOUT_MS = 60000;

/** What the learner is to say now (platform `StepView`). */
export type SessionStep =
  | {
      phase: 'diagnostic';
      atomId: string;
      family: string;
      index: number;
      total: number;
      word: string;
      sentence: string;
    }
  | {
      phase: 'drill';
      atomId: string;
      family: string;
      elementIndex: number;
      element:
        | { kind: 'word'; word: string }
        | { kind: 'pair'; words: [string, string]; judged: number[] }
        | { kind: 'phrase'; text: string };
      /** The word of this take; null for a phrase. */
      say: string | null;
      sentence: string;
      fails: number;
    };

export type SoundStatus = 'pending' | 'open' | 'passed' | 'failed';

export type DoneReason = 'finished' | 'take_limit' | 'stopped' | 'pool_empty' | 'not_available';

export interface SoundSession {
  attemptId: string;
  resumed: boolean;
  language: string;
  basis: 'chosen' | 'record' | 'diagnostic';
  phase: 'diagnostic' | 'drill' | 'done';
  doneReason: DoneReason | null;
  takes: number;
  maxTakes: number;
  /** Sent back with a take; another one answers 409 `STALE_TAKE`. */
  takeIndex: number;
  sounds: Array<{ atomId: string; family: string; status: SoundStatus }>;
  diagnostic: { measured: number; total: number } | null;
  step: SessionStep | null;
}

/** What one session may cost; warn only when the learner pays and the rest is under the estimate. */
export interface SessionBudget {
  payer: 'school' | 'learner';
  metered: boolean;
  remainingCredits: number | null;
  estimatedCredits: number | null;
}

export interface ReferenceClip {
  word: string;
  url: string;
  mimeType: string;
}

/** The base's words about a sound, in the interface language. */
export interface SoundInstruction {
  atomId: string;
  title: string;
  howTo: string;
  drill: string | null;
  commonError: string | null;
  ukNote: string | null;
}

export interface SessionItems {
  session: SoundSession;
  clips: ReferenceClip[];
  instruction: SoundInstruction | null;
}

export type StepEvent =
  | {
      kind: 'retry' | 'side_passed' | 'element_passed' | 'sound_failed' | 'sound_passed';
      atomId: string;
    }
  | { kind: 'diagnostic_measured'; atomId: string; weak: boolean }
  | { kind: 'diagnostic_done'; weak: string[] }
  | { kind: 'session_done'; reason: DoneReason };

/** Pitch curves, one value per `stepMs`, `null` where there is no voiced sound. */
export interface Melody {
  stepMs: number;
  learner: Array<number | null>;
  reference: Array<number | null>;
}

export interface TakeVerdict {
  measured: boolean;
  passed: boolean | null;
  /** The kind of miss (`KJ:major`, `TONE:1`). */
  key: string | null;
}

export interface TakeResult {
  outcome: 'judged' | 'stopped' | 'retry';
  reason: string | null;
  verdict: TakeVerdict | null;
  feedback: Feedback | null;
  toneme: { tone: 1 | 2; verdict: string; melody: Melody } | null;
  events: StepEvent[];
  session: SoundSession;
}

export type Rating = 'GOOD' | 'HARD' | 'AGAIN';

export interface SessionResult {
  score: number | null;
  doneReason: DoneReason | null;
  sounds: Array<{
    atomId: string;
    status: SoundStatus;
    passes: number;
    fails: number;
    rating: Rating | null;
  }>;
  diagnosticWeak: string[];
  flagged: string[];
}

/** The card of one sound (content-service `GET sound-atoms/:atomId`), the fields the phone draws. */
export interface SoundCard {
  atomId: string;
  family: string;
  ipa: string;
  title: string;
  description: string | null;
  howTo: string | null;
  drill: string | null;
  commonError: string | null;
  ukNote: string | null;
  carrierWords: string[];
}

/* ── Reading ───────────────────────────────────────────────────────── */

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const DONE: readonly string[] = ['finished', 'take_limit', 'stopped', 'pool_empty', 'not_available'];
const STATUS: readonly string[] = ['pending', 'open', 'passed', 'failed'];

function doneReason(v: unknown): DoneReason | null {
  return typeof v === 'string' && DONE.includes(v) ? (v as DoneReason) : null;
}

function parseStep(raw: unknown): SessionStep | null {
  if (!isRecord(raw)) return null;
  const atomId = str(raw.atomId);
  const family = str(raw.family);
  const sentence = str(raw.sentence);
  if (atomId === null || family === null || sentence === null) return null;
  if (raw.phase === 'diagnostic') {
    const word = str(raw.word);
    const index = num(raw.index);
    const total = num(raw.total);
    if (word === null || index === null || total === null) return null;
    return { phase: 'diagnostic', atomId, family, index, total, word, sentence };
  }
  if (raw.phase !== 'drill' || !isRecord(raw.element)) return null;
  const e = raw.element;
  const elementIndex = num(raw.elementIndex);
  if (elementIndex === null) return null;
  let element: Extract<SessionStep, { phase: 'drill' }>['element'] | null = null;
  if (e.kind === 'word' && typeof e.word === 'string') element = { kind: 'word', word: e.word };
  else if (e.kind === 'phrase' && typeof e.text === 'string') {
    element = { kind: 'phrase', text: e.text };
  } else if (
    e.kind === 'pair' &&
    Array.isArray(e.words) &&
    typeof e.words[0] === 'string' &&
    typeof e.words[1] === 'string'
  ) {
    element = {
      kind: 'pair',
      words: [e.words[0], e.words[1]],
      judged: Array.isArray(e.judged)
        ? e.judged.filter((n): n is number => typeof n === 'number')
        : [],
    };
  }
  if (element === null) return null;
  return {
    phase: 'drill',
    atomId,
    family,
    elementIndex,
    element,
    say: str(raw.say),
    sentence,
    fails: num(raw.fails) ?? 0,
  };
}

export function parseSession(raw: unknown): SoundSession | null {
  if (!isRecord(raw)) return null;
  const attemptId = str(raw.attemptId);
  const language = str(raw.language);
  const takes = num(raw.takes);
  const maxTakes = num(raw.maxTakes);
  const takeIndex = num(raw.takeIndex);
  if (
    attemptId === null ||
    language === null ||
    takes === null ||
    maxTakes === null ||
    takeIndex === null
  ) {
    return null;
  }
  if (raw.phase !== 'diagnostic' && raw.phase !== 'drill' && raw.phase !== 'done') return null;
  const basis =
    raw.basis === 'chosen' || raw.basis === 'record' || raw.basis === 'diagnostic'
      ? raw.basis
      : 'record';
  const sounds: SoundSession['sounds'] = [];
  for (const s of Array.isArray(raw.sounds) ? raw.sounds : []) {
    if (!isRecord(s) || typeof s.atomId !== 'string' || !STATUS.includes(String(s.status))) {
      continue;
    }
    sounds.push({ atomId: s.atomId, family: str(s.family) ?? '', status: s.status as SoundStatus });
  }
  const d = isRecord(raw.diagnostic) ? raw.diagnostic : null;
  const measured = d === null ? null : num(d.measured);
  const total = d === null ? null : num(d.total);
  const step = parseStep(raw.step);
  // A live session with nothing to say is broken, not finished.
  if (raw.phase !== 'done' && step === null) return null;
  return {
    attemptId,
    resumed: raw.resumed === true,
    language,
    basis,
    phase: raw.phase,
    doneReason: doneReason(raw.doneReason),
    takes,
    maxTakes,
    takeIndex,
    sounds,
    diagnostic: measured !== null && total !== null ? { measured, total } : null,
    step,
  };
}

function parseBudget(raw: unknown): SessionBudget | null {
  if (!isRecord(raw) || (raw.payer !== 'school' && raw.payer !== 'learner')) return null;
  // Credits travel as decimal strings.
  const credits = (v: unknown) =>
    typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    payer: raw.payer,
    metered: raw.metered === true,
    remainingCredits: credits(raw.remainingCredits),
    estimatedCredits: credits(raw.estimatedCredits),
  };
}

export function parseStart(
  raw: unknown,
): { session: SoundSession; budget: SessionBudget | null } | null {
  const session = parseSession(raw);
  if (session === null || !isRecord(raw)) return null;
  return { session, budget: parseBudget(raw.budget) };
}

function parseClips(raw: unknown): ReferenceClip[] {
  const clips: ReferenceClip[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!isRecord(c) || typeof c.word !== 'string' || typeof c.url !== 'string') continue;
    clips.push({ word: c.word, url: c.url, mimeType: str(c.mimeType) ?? 'audio/mpeg' });
  }
  return clips;
}

function parseInstruction(raw: unknown): SoundInstruction | null {
  if (!isRecord(raw) || typeof raw.atomId !== 'string' || typeof raw.howTo !== 'string') {
    return null;
  }
  return {
    atomId: raw.atomId,
    title: str(raw.title) ?? '',
    howTo: raw.howTo,
    drill: str(raw.drill),
    commonError: str(raw.commonError),
    ukNote: str(raw.ukNote),
  };
}

export function parseItems(raw: unknown): SessionItems | null {
  if (!isRecord(raw)) return null;
  const session = parseSession(raw.session);
  if (session === null) return null;
  return {
    session,
    clips: parseClips(raw.clips),
    instruction: parseInstruction(raw.instruction),
  };
}

function parseEvents(raw: unknown): StepEvent[] {
  const events: StepEvent[] = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!isRecord(e)) continue;
    switch (e.kind) {
      case 'retry':
      case 'side_passed':
      case 'element_passed':
      case 'sound_failed':
      case 'sound_passed':
        if (typeof e.atomId === 'string') events.push({ kind: e.kind, atomId: e.atomId });
        break;
      case 'diagnostic_measured':
        if (typeof e.atomId === 'string') {
          events.push({ kind: e.kind, atomId: e.atomId, weak: e.weak === true });
        }
        break;
      case 'diagnostic_done':
        events.push({ kind: e.kind, weak: strings(e.weak) });
        break;
      case 'session_done': {
        const reason = doneReason(e.reason);
        if (reason !== null) events.push({ kind: e.kind, reason });
        break;
      }
    }
  }
  return events;
}

function parseMelody(raw: unknown): Melody | null {
  if (!isRecord(raw)) return null;
  const stepMs = num(raw.stepMs);
  const curve = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) : null;
  const learner = curve(raw.learner);
  const reference = curve(raw.reference);
  if (stepMs === null || stepMs <= 0 || learner === null || reference === null) return null;
  return { stepMs, learner, reference };
}

export function parseTake(raw: unknown): TakeResult | null {
  if (!isRecord(raw)) return null;
  if (raw.outcome !== 'judged' && raw.outcome !== 'stopped' && raw.outcome !== 'retry') {
    return null;
  }
  const session = parseSession(raw.session);
  if (session === null) return null;
  const v = isRecord(raw.verdict) ? raw.verdict : null;
  const t = isRecord(raw.toneme) ? raw.toneme : null;
  const melody = t === null ? null : parseMelody(t.melody);
  return {
    outcome: raw.outcome,
    reason: str(raw.reason),
    verdict:
      v === null
        ? null
        : {
            measured: v.measured === true,
            passed: typeof v.passed === 'boolean' ? v.passed : null,
            key: str(v.key),
          },
    feedback: raw.feedback == null ? null : parseFeedback(raw.feedback),
    toneme:
      t !== null &&
      melody !== null &&
      (t.tone === 1 || t.tone === 2) &&
      typeof t.verdict === 'string'
        ? { tone: t.tone, verdict: t.verdict, melody }
        : null,
    events: parseEvents(raw.events),
    session,
  };
}

export function parseResult(raw: unknown): SessionResult | null {
  if (!isRecord(raw)) return null;
  const sounds: SessionResult['sounds'] = [];
  for (const s of Array.isArray(raw.sounds) ? raw.sounds : []) {
    if (!isRecord(s) || typeof s.atomId !== 'string' || !STATUS.includes(String(s.status))) {
      continue;
    }
    const rating =
      s.rating === 'GOOD' || s.rating === 'HARD' || s.rating === 'AGAIN'
        ? (s.rating as Rating)
        : null;
    sounds.push({
      atomId: s.atomId,
      status: s.status as SoundStatus,
      passes: num(s.passes) ?? 0,
      fails: num(s.fails) ?? 0,
      rating,
    });
  }
  return {
    score: num(raw.score),
    doneReason: doneReason(raw.doneReason),
    sounds,
    diagnosticWeak: strings(raw.diagnosticWeak),
    flagged: strings(raw.flagged),
  };
}

export function parseSoundCard(raw: unknown): SoundCard | null {
  if (!isRecord(raw) || typeof raw.atomId !== 'string' || typeof raw.family !== 'string') {
    return null;
  }
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  return {
    atomId: raw.atomId,
    family: raw.family,
    ipa: text(raw.ipa) ?? '',
    title: text(raw.title) ?? raw.family,
    description: text(raw.description),
    howTo: text(raw.howTo),
    drill: text(raw.drill),
    commonError: text(raw.commonError),
    ukNote: text(raw.ukNote),
    carrierWords: strings(raw.carrierWords),
  };
}

/* ── Calls ─────────────────────────────────────────────────────────── */

/** An answer this file cannot read is a fault, not a success. */
export class SoundSessionUnreadableError extends Error {
  constructor() {
    super('The pronunciation session answered something this app cannot read');
    this.name = 'SoundSessionUnreadableError';
  }
}

function read<T>(raw: unknown, parse: (r: unknown) => T | null): T {
  const out = parse(raw);
  if (out === null) throw new SoundSessionUnreadableError();
  return out;
}

/** Start the learner's session, or get the open one back; `atomId` chooses a sound to train. */
export async function startSoundSession(
  language: string,
  atomId?: string,
): Promise<{ session: SoundSession; budget: SessionBudget | null }> {
  const raw = await apiClient.post<unknown>(
    SESSIONS_PATH,
    { language, ...(atomId === undefined ? {} : { atomId }) },
    { timeoutMs: TAKE_TIMEOUT_MS },
  );
  return read(raw, parseStart);
}

/** The step in hand: reference clips as signed links and the base's instruction. */
export async function getSoundSessionItems(
  attemptId: string,
  locale: string,
): Promise<SessionItems> {
  const raw = await apiClient.get<unknown>(`${SESSIONS_PATH}/${attemptId}/items`, {
    query: { locale },
  });
  return read(raw, parseItems);
}

/** One take: a recording uploaded as a `submission_recording` of this attempt, judged. */
export async function postSoundTake(
  attemptId: string,
  body: { recordingAssetId: string; takeIndex: number; explanationLanguage: string },
): Promise<TakeResult> {
  const raw = await apiClient.post<unknown>(`${SESSIONS_PATH}/${attemptId}/takes`, body, {
    timeoutMs: TAKE_TIMEOUT_MS,
  });
  return read(raw, parseTake);
}

/** Hand the session in: the sounds' ratings reach the learner's cards. */
export async function submitSoundSession(
  attemptId: string,
  locale: string,
): Promise<SessionResult> {
  const raw = await apiClient.post<unknown>(`${SESSIONS_PATH}/${attemptId}/submit`, undefined, {
    query: { locale },
    timeoutMs: TAKE_TIMEOUT_MS,
  });
  return read(raw, parseResult);
}

/** The learner's card of a sound, in the interface language (unknown locale → `en` on the server). */
export async function getSoundCard(atomId: string, locale: string): Promise<SoundCard> {
  const raw = await apiClient.get<unknown>(`/api/v1/sound-atoms/${encodeURIComponent(atomId)}`, {
    query: { locale },
  });
  return read(raw, parseSoundCard);
}

/** Why a call was refused: the engine's own code and the numbers it acts on. */
export interface SoundRefusal {
  status: number | null;
  code: string | null;
  retryAfterMs: number | null;
  takeIndex: number | null;
}

/** Null for anything that is not an `ApiError` (a fault in this app, not a refusal). */
export function soundRefusal(e: unknown): SoundRefusal | null {
  if (!(e instanceof ApiError)) return null;
  const body = isRecord(e.body) ? e.body : {};
  return {
    status: e.status,
    code: e.code ?? str(body.code),
    retryAfterMs: num(body.retryAfterMs),
    takeIndex: num(body.takeIndex),
  };
}
