/**
 * Pure logic for `dictation` — a recording, and the sentences said in it written down one at
 * a time (plan 68).
 *
 * What arrives here is never the stored document but a **projection** of it (shared-kernel
 * `dictation/projection.ts`): the instruction, the mode, per sentence its id and — only when
 * the author chose to show it — how many words it has, and the settings a runner must know
 * before the first check. The sentences, their reasons and focus words, the orphans, the
 * marking rules and the pass mark stay on the server (plan 68 §3.2, AC-X2).
 *
 * Nothing on this side grades. The text goes up as typed and the verdict comes down — the
 * corrected line, the counts, whether it passed, the reasons — dosed by how the sentence
 * stands: the reason only after a failed check with hints on, the sentence itself only on a
 * reveal, its transcript slice only once it closed (§3.5, §3.6).
 *
 * The same rules as the web solver (`dictation-projection.ts`, `dictation-solver.tsx`), function
 * for function, so the two platforms cannot drift on which sentence is next, what a reload
 * restores or what the summary counts.
 */

/* ── The projection ────────────────────────────────────────────────────────── */

export type DictationMode = 'segments' | 'whole';

export interface ProjectedSegment {
  id: string;
  /** Words in the sentence — present only when the author chose to show the count (AC-R3). */
  wordCount?: number;
}

/**
 * The settings that change what the runner may draw or offer. `revealKey` is read although
 * it decides what the *server* sends: «Show the answer» must exist or not before the first
 * check, and knowing a sentence can be shown is not the sentence. `attempts` is the
 * per-sentence check budget, `0` meaning no limit — the server enforces it.
 */
export interface DictationSettings {
  attempts: 0 | 1 | 2 | 3;
  hints: boolean;
  revealKey: boolean;
  showWordCount: boolean;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface DictationProjection {
  instruction: string;
  mode: DictationMode;
  segments: ProjectedSegment[];
  settings: DictationSettings;
}

/** Names that belong to the key or to grading — none may reach a student (AC-X2, AC-R3). */
const ROOT_KEY = ['orphans', 'marking', 'threshold', 'language', 'transcript'];
const SEGMENT_KEY = ['text', 'why', 'focus'];
const SETTINGS_KEY = ['threshold'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept the dictation only if what arrived is the student projection.
 *
 * A root, a sentence or the settings carrying any key field is the stored document, not the
 * projection — a content-service older than plan 68 phase 3, or a route that reached for the
 * authoring copy. The answer is to refuse, not to strip: stripping would leave a runner that
 * works over a screen holding the key (plan 50's finding; plans 51, 53, 54, 66 and 67 repeat
 * it).
 */
export function readDictationProjection(
  value: unknown,
): DictationProjection | null {
  if (!isRecord(value)) return null;
  if (ROOT_KEY.some(k => k in value)) return null;
  if (!Array.isArray(value.segments)) return null;

  const segments: ProjectedSegment[] = [];
  for (const entry of value.segments as unknown[]) {
    if (!isRecord(entry)) return null;
    if (SEGMENT_KEY.some(k => k in entry)) return null;
    const { id, wordCount } = entry;
    if (typeof id !== 'string' || id === '') return null;
    segments.push(
      // A count the projection did not mean to give is not shown (AC-R3).
      typeof wordCount === 'number' &&
        Number.isInteger(wordCount) &&
        wordCount > 0
        ? { id, wordCount }
        : { id },
    );
  }

  const raw = isRecord(value.settings) ? value.settings : {};
  if (SETTINGS_KEY.some(k => k in raw)) return null;
  const attempts = raw.attempts;

  return {
    instruction: typeof value.instruction === 'string' ? value.instruction : '',
    mode: value.mode === 'whole' ? 'whole' : 'segments',
    segments,
    settings: {
      // Anything out of range is read as no limit: the server is the one that refuses a
      // check, so a wrong guess here only shows a button it refuses.
      attempts:
        attempts === 1 || attempts === 2 || attempts === 3 ? attempts : 0,
      hints: raw.hints === true,
      revealKey: raw.revealKey === true,
      showWordCount: raw.showWordCount === true,
    },
  };
}

/* ── The corrected line ────────────────────────────────────────────────────── */

/** How a wrong word went wrong — the kernel's `ErrorClass`. */
export type ErrorClass =
  | 'punctuation'
  | 'case'
  | 'diacritic'
  | 'typo'
  | 'wrong'
  | 'boundary';

const ERROR_CLASSES: readonly ErrorClass[] = [
  'punctuation',
  'case',
  'diacritic',
  'typo',
  'wrong',
  'boundary',
];

/**
 * One step of the corrected line, as the server sent it (the kernel's `VerdictOp`):
 *
 * - `eq` — a word written as expected, `w`/`p` as the student wrote them;
 * - `sub` — a word written instead of the expected one(s); `near` when it earns half;
 * - `del` — an expected word with nothing written for it;
 * - `ins` — a word written that is not in the recording.
 *
 * `p` is the punctuation after the word. `why` rides on a wrong focus word.
 */
export type VerdictOp =
  | { k: 'eq'; w: string; p: string }
  | {
      k: 'sub';
      wrote: string;
      expected: string;
      p: string;
      cls: ErrorClass;
      near: boolean;
      focus: boolean;
      why?: string;
    }
  | { k: 'del'; expected: string; p: string; focus: boolean; why?: string }
  | { k: 'ins'; wrote: string; p: string };

export interface WordCounts {
  /** Expected words. */
  total: number;
  exact: number;
  near: number;
  wrong: number;
  missing: number;
  extra: number;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function why(value: Record<string, unknown>): { why?: string } {
  return typeof value.why === 'string' && value.why.trim() !== ''
    ? { why: value.why }
    : {};
}

/** One op, or `null` when it is no op this app can draw — dropped, never guessed at. */
function readOp(value: unknown): VerdictOp | null {
  if (!isRecord(value)) return null;
  switch (value.k) {
    case 'eq':
      return { k: 'eq', w: str(value.w), p: str(value.p) };
    case 'sub': {
      const cls = ERROR_CLASSES.find(c => c === value.cls) ?? 'wrong';
      return {
        k: 'sub',
        wrote: str(value.wrote),
        expected: str(value.expected),
        p: str(value.p),
        cls,
        near: value.near === true,
        focus: value.focus === true,
        ...why(value),
      };
    }
    case 'del':
      return {
        k: 'del',
        expected: str(value.expected),
        p: str(value.p),
        focus: value.focus === true,
        ...why(value),
      };
    case 'ins':
      return { k: 'ins', wrote: str(value.wrote), p: str(value.p) };
    default:
      return null;
  }
}

export function readOps(value: unknown): VerdictOp[] {
  if (!Array.isArray(value)) return [];
  return value.map(readOp).filter((op): op is VerdictOp => op !== null);
}

export function readCounts(value: unknown): WordCounts {
  const w = isRecord(value) ? value : {};
  return {
    total: num(w.total),
    exact: num(w.exact),
    near: num(w.near),
    wrong: num(w.wrong),
    missing: num(w.missing),
    extra: num(w.extra),
  };
}

/* ── Where the sentences stand ─────────────────────────────────────────────── */

/** A focus word, by name — a wrong one on a check, every one on a reveal. */
export interface FocusLine {
  focusId: string;
  word: string;
  why: string;
}

/** The sentence as a reveal showed it. */
export interface RevealedKey {
  text: string;
  why: string;
  focus: FocusLine[];
}

/** The last check of a sentence, as the student saw it — the summary's corrected line. */
export interface LastCheck {
  /** 0–100 rounded. */
  pct: number;
  words: WordCounts;
  ops: VerdictOp[];
  /** The sentence's reason, when this check failed with hints on (AC-R10). */
  why?: string;
}

/**
 * The server's word on one sentence — the kernel's `SegmentState`, minus `first`, which
 * only the evidence and the reports read. Everything here is something the learner has
 * already been shown, which is why a reload may have it back.
 */
export interface SegmentState {
  segmentId: string;
  /** Checks made. A reveal is not one. */
  checks: number;
  /** 0..1 — the first check's score, the record (AC-R8); `null` until there was one. */
  firstScore: number | null;
  firstPassed: boolean | null;
  passed: boolean;
  revealed: boolean;
  /** No further check: passed, revealed, or out of checks. */
  closed: boolean;
  /** The last checked text — a retry keeps it, a reload restores it. */
  lastText: string;
  last: LastCheck | null;
  key: RevealedKey | null;
  transcriptSlice: string | null;
}

function readFocus(value: unknown): FocusLine[] {
  if (!Array.isArray(value)) return [];
  const out: FocusLine[] = [];
  for (const f of value) {
    if (!isRecord(f)) continue;
    if (typeof f.focusId !== 'string' || typeof f.word !== 'string') continue;
    out.push({ focusId: f.focusId, word: f.word, why: str(f.why) });
  }
  return out;
}

function readKey(value: unknown): RevealedKey | null {
  if (!isRecord(value) || typeof value.text !== 'string') return null;
  return {
    text: value.text,
    why: str(value.why),
    focus: readFocus(value.focus),
  };
}

function readLast(value: unknown): LastCheck | null {
  if (!isRecord(value)) return null;
  return {
    pct: num(value.pct),
    words: readCounts(value.words),
    ops: readOps(value.ops),
    ...why(value),
  };
}

/**
 * The carried sentence states — from a verdict or from the open attempt. `unknown`, so it
 * must not throw: a malformed entry is dropped and its sentence reads as untouched.
 */
export function readSegmentStates(value: unknown): SegmentState[] {
  if (!Array.isArray(value)) return [];
  const out: SegmentState[] = [];
  for (const st of value) {
    if (!isRecord(st) || typeof st.segmentId !== 'string') continue;
    out.push({
      segmentId: st.segmentId,
      checks: Math.max(0, Math.trunc(num(st.checks))),
      firstScore: typeof st.firstScore === 'number' ? st.firstScore : null,
      firstPassed: typeof st.firstPassed === 'boolean' ? st.firstPassed : null,
      passed: st.passed === true,
      revealed: st.revealed === true,
      closed: st.closed === true,
      lastText: str(st.lastText),
      last: readLast(st.last),
      key: readKey(st.key),
      transcriptSlice:
        typeof st.transcriptSlice === 'string' ? st.transcriptSlice : null,
    });
  }
  return out;
}

/* ── The verdict ───────────────────────────────────────────────────────────── */

/** `details` of a submit, as plan 68 phase 4 contracted it for the runners. */
export interface DictationVerdict {
  segmentId: string;
  /** This sentence, this check, 0–100 — on a reveal, the first check's. */
  pct: number;
  passed: boolean;
  words: WordCounts;
  /** The corrected line. Empty on a reveal. */
  ops: VerdictOp[];
  /** Near misses earned half a word each on this check — «(half credit)». */
  nearCredit: boolean;
  /** The wrong focus words, by name. */
  focus: FocusLine[];
  /** The sentence's reason — after a failed check, with hints on. */
  why?: string;
  /** Only on a reveal. */
  key?: RevealedKey;
  /** Only on the submit that closed the sentence, under `transcriptWhen: 'after'`. */
  transcriptSlice?: string;
  attempt: number;
  /** `null` — no limit. */
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  segments: SegmentState[];
  /** Whether this submit closed the last open sentence, and with it the attempt. */
  complete: boolean;
  attemptPct: number;
  attemptPassed: boolean;
}

/** Read `details` of a submit; `null` when it is not this template's verdict. */
export function readDictationVerdict(value: unknown): DictationVerdict | null {
  if (!isRecord(value)) return null;
  if (typeof value.segmentId !== 'string') return null;
  if (!Array.isArray(value.ops) || !Array.isArray(value.segments)) return null;

  const key = readKey(value.key);
  return {
    segmentId: value.segmentId,
    pct: num(value.pct),
    passed: value.passed === true,
    words: readCounts(value.words),
    ops: readOps(value.ops),
    nearCredit: value.nearCredit === true,
    focus: readFocus(value.focus),
    ...why(value),
    ...(key !== null ? { key } : {}),
    ...(typeof value.transcriptSlice === 'string'
      ? { transcriptSlice: value.transcriptSlice }
      : {}),
    attempt: num(value.attempt, 1),
    checksLeft: typeof value.checksLeft === 'number' ? value.checksLeft : null,
    closed: value.closed === true,
    revealed: value.revealed === true,
    segments: readSegmentStates(value.segments),
    complete: value.complete === true,
    attemptPct: num(value.attemptPct),
    attemptPassed: value.attemptPassed === true,
  };
}

/** The body of `submittedAnswer` — a check of the sentence's text, or a reveal. */
export function buildDictationSubmission(
  segmentId: string,
  text: string,
  reveal: boolean,
): { segmentId: string; text?: string; reveal?: true } {
  if (reveal) return { segmentId, reveal: true };
  return { segmentId, text };
}

/* ── Moving through the sentences ──────────────────────────────────────────── */

/** Where a sentence opens: its index, the check it is on, and the text it had. */
export interface SentenceAt {
  index: number;
  /** One past the checks already spent. */
  attempt: number;
  /** The last checked text — text never checked was never on the server (plan 68 §8, 3). */
  text: string;
}

function stateOf(
  states: readonly SegmentState[],
  id: string | undefined,
): SegmentState | undefined {
  return states.find(s => s.segmentId === id);
}

function at(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
  index: number,
): SentenceAt {
  const here = stateOf(states, segments[index]?.id);
  return {
    index,
    attempt: (here?.checks ?? 0) + 1,
    text: here?.lastText ?? '',
  };
}

/**
 * Where a resumed attempt opens: the first sentence still open, on the check after the last
 * one it spent, with its last checked text back in the field. A fresh attempt opens on the
 * first sentence.
 */
export function resumeAt(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
): SentenceAt {
  const open = segments.findIndex(s => stateOf(states, s.id)?.closed !== true);
  return at(segments, states, open === -1 ? 0 : open);
}

/**
 * «Next sentence» — the next one still open after `from`, or `null` when none is and the
 * summary follows. Forward only, as on the web: a resumed attempt opens on the first open
 * sentence, so every one before the sentence on screen is already closed.
 */
export function nextOpen(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
  from: number,
): SentenceAt | null {
  const ahead = segments.findIndex(
    (s, i) => i > from && stateOf(states, s.id)?.closed !== true,
  );
  return ahead === -1 ? null : at(segments, states, ahead);
}

export type RailState = 'done' | 'part' | 'now' | null;

/**
 * The rail's three states, as the prototype has them (plan 68 §4.2, 11): spelled right,
 * checked or revealed and not right, the one being written. Read off the server's states.
 */
export function railStates(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
  index: number,
): RailState[] {
  return segments.map((s, i) => {
    const st = stateOf(states, s.id);
    if (st?.passed === true) return 'done';
    if ((st?.checks ?? 0) > 0 || st?.revealed === true) return 'part';
    return i === index ? 'now' : null;
  });
}

/**
 * The transcript drawer's text: the slices of the sentences already closed, in order —
 * never one still to be written (plan 68 §3.6).
 */
export function transcriptSlices(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
): string[] {
  return segments
    .map(s => stateOf(states, s.id)?.transcriptSlice ?? null)
    .filter((s): s is string => s !== null && s.trim() !== '');
}

/* ── The summary ───────────────────────────────────────────────────────────── */

export interface SummaryRow {
  id: string;
  /** 1-based. */
  n: number;
  /** The last check's corrected line; `null` when the sentence was never checked. */
  ops: VerdictOp[] | null;
  /** The sentence, when it was revealed and never checked. */
  keyText: string | null;
  /** The reason its last check or its reveal showed; `''` once spelled right. */
  reason: string;
  /** The first check, never a retry (AC-R8). */
  pct: number;
  ok: boolean;
}

/**
 * One row per sentence (AC-R10): the **last** check's corrected line beside the **first**
 * check's score — the line is what the learner last wrote, the number is the record
 * (plan 68 phase 4, finding 3). Both are the server's.
 */
export function summaryRows(
  segments: readonly ProjectedSegment[],
  states: readonly SegmentState[],
): { rows: SummaryRow[]; right: number } {
  const rows = segments.map((s, i): SummaryRow => {
    const st = stateOf(states, s.id);
    return {
      id: s.id,
      n: i + 1,
      ops: st?.last != null ? st.last.ops : null,
      keyText: st?.last == null && st?.key != null ? st.key.text : null,
      reason: st?.passed === true ? '' : st?.last?.why ?? st?.key?.why ?? '',
      pct: Math.round((st?.firstScore ?? 0) * 100),
      ok: st?.firstPassed === true,
    };
  });
  return { rows, right: rows.filter(r => r.ok).length };
}
