/**
 * Pure logic for `highlight_in_text` — a passage, and up to four questions answered one at
 * a time by marking the words that answer them (plan 67).
 *
 * What arrives here is never the stored document but a **projection** of it (shared-kernel
 * `highlight-in-text/projection.ts`): the passage, its paragraph ranges, and per question its
 * id, prompt, unit and — only when the author chose to show it — how many marks are
 * expected. The spans, their reasons, both hints, the threshold and the penalty stay on the
 * server (AC-S11).
 *
 * Nothing on this side grades. The marks go up as character offsets and the verdict comes
 * down: a check returns the student's own marks with a state each and a *count* of what
 * was missed (AC-S5); only a reveal returns the key (AC-S9).
 *
 * The same rules as the web solver (`highlight-in-text-marks.ts`, `-projection.ts`),
 * function for function, so the two platforms cannot drift on what a tap marks, what a
 * retry keeps or what a token shows.
 */

import { tokenize, type Token } from '../../../lib/text/words';

/* ── The tokenizer ─────────────────────────────────────────────────────────── */

/**
 * A word as the grader sees it — SPEC_data_model §2. The one copy of the kernel's expression
 * in this app lives in `lib/text/words.ts` (plan 68, Q1-A); re-exported here so this
 * template's callers and its fixture test read it where they always have.
 */
export { tokenize, type Token };

/** Inclusive token indices. */
export interface TokenRun {
  t0: number;
  t1: number;
}

/** Character offsets into the passage, `end` exclusive — how the wire speaks. */
export interface CharRange {
  start: number;
  end: number;
}

/** The run of tokens a character range touches, or `null` when it touches none. */
export function toTokenRun(
  tokens: readonly Token[],
  range: CharRange,
): TokenRun | null {
  if (!(range.end > range.start)) return null;
  let t0 = -1;
  let t1 = -1;
  for (const t of tokens) {
    if (t.e <= range.start) continue;
    if (t.s >= range.end) break;
    if (t0 === -1) t0 = t.i;
    t1 = t.i;
  }
  return t0 === -1 ? null : { t0, t1 };
}

/** The characters a run covers: first token's start to last token's end. */
export function toCharRange(
  tokens: readonly Token[],
  run: TokenRun,
): CharRange {
  const first = tokens[run.t0];
  const last = tokens[run.t1];
  if (!first || !last) return { start: 0, end: 0 };
  return { start: first.s, end: last.e };
}

/**
 * For each token, the index of the paragraph it is in — read off the projection's
 * paragraph ranges, which the server cut with the kernel's own splitter, so there is no
 * second copy of that rule here. A token outside every range (a projection without
 * `paragraphs`) is put in the paragraph before it, or the first.
 */
export function paragraphOfTokens(
  tokens: readonly Token[],
  paragraphs: ReadonlyArray<readonly [number, number]>,
): number[] {
  const out: number[] = [];
  let p = 0;
  for (const t of tokens) {
    while (p < paragraphs.length - 1 && t.s >= (paragraphs[p]?.[1] ?? 0)) p++;
    out.push(paragraphs.length === 0 ? 0 : p);
  }
  return out;
}

/** Cut a run at the paragraph its **origin** is in — a mark never crosses a paragraph. */
export function clampToParagraph(
  paragraphOf: readonly number[],
  origin: number,
  other: number,
): TokenRun {
  const p = paragraphOf[origin];
  let t0 = Math.min(origin, other);
  let t1 = Math.max(origin, other);
  while (t0 < origin && paragraphOf[t0] !== p) t0++;
  while (t1 > origin && paragraphOf[t1] !== p) t1--;
  return { t0, t1 };
}

/* ── The projected passage ─────────────────────────────────────────────────── */

export type Unit = 'word' | 'phrase';

export interface ProjectedQuestion {
  id: string;
  prompt: string;
  unit: Unit;
  /** Marks expected — `null` unless the author chose to show the count (AC-S10). */
  count: number | null;
}

/**
 * The settings that change what the runner may draw or offer. `revealKey` is read although
 * it decides how much of the key the server sends: «Show the answer» must exist or not
 * before the first check, and knowing a key can be shown is not the key. `attempts` is the
 * per-question check budget, `0` meaning no limit — the server enforces it.
 */
export interface HighlightInTextSettings {
  attempts: 0 | 1 | 2 | 3;
  hints: boolean;
  revealKey: boolean;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface HighlightInTextPassage {
  instruction: string;
  text: string;
  /** `[start, end)` of each paragraph in `text`. */
  paragraphs: Array<[number, number]>;
  questions: ProjectedQuestion[];
  settings: HighlightInTextSettings;
}

/** Names that belong to the key or to grading — none may reach a student (AC-S11). */
const ROOT_KEY = [
  'spans',
  'orphans',
  'threshold',
  'penalty',
  'missHint',
  'fpHint',
];
const QUESTION_KEY = ['spans', 'why', 'missHint', 'fpHint'];
const SETTINGS_KEY = ['threshold', 'penalty', 'showCount'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept the passage only if what arrived is the student projection.
 *
 * A root, a question or the settings carrying any key field is the stored document, not the
 * projection — a content-service older than plan 67 phase 3, or a route that reached for the
 * authoring copy. The answer is to refuse, not to strip: stripping would leave a runner that
 * works over a screen holding the key (plan 50's finding; plans 51, 53, 54 and 66 repeat it).
 */
export function readHighlightInTextPassage(
  value: unknown,
): HighlightInTextPassage | null {
  if (!isRecord(value)) return null;
  if (ROOT_KEY.some(k => k in value)) return null;

  const text = value.text;
  if (typeof text !== 'string') return null;
  if (!Array.isArray(value.questions)) return null;

  const questions: ProjectedQuestion[] = [];
  for (const entry of value.questions as unknown[]) {
    if (!isRecord(entry)) return null;
    if (QUESTION_KEY.some(k => k in entry)) return null;
    const { id, prompt, count } = entry;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof prompt !== 'string' || prompt.trim() === '') return null;
    questions.push({
      id,
      prompt: prompt.trim(),
      unit: entry.unit === 'phrase' ? 'phrase' : 'word',
      count:
        typeof count === 'number' && Number.isInteger(count) && count > 0
          ? count
          : null,
    });
  }

  const raw = isRecord(value.settings) ? value.settings : {};
  if (SETTINGS_KEY.some(k => k in raw)) return null;
  const attempts = raw.attempts;

  return {
    instruction: typeof value.instruction === 'string' ? value.instruction : '',
    text,
    paragraphs: readParagraphs(value.paragraphs, text),
    questions,
    settings: {
      attempts:
        attempts === 1 || attempts === 2 || attempts === 3 ? attempts : 0,
      hints: raw.hints === true,
      revealKey: raw.revealKey === true,
    },
  };
}

/** The projection's paragraph ranges; the whole text as one when it sent none. */
function readParagraphs(raw: unknown, text: string): Array<[number, number]> {
  const ranges = Array.isArray(raw)
    ? raw.filter(
        (p): p is [number, number] =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === 'number' &&
          typeof p[1] === 'number' &&
          p[1] > p[0],
      )
    : [];
  return ranges.length > 0 ? ranges : [[0, text.length]];
}

/* ── The verdict ───────────────────────────────────────────────────────────── */

export type CellState = 'exact' | 'near' | 'fp';

/** One of the student's marks as the server snapped, merged and judged it. */
export interface VerdictCell extends CharRange {
  state: CellState;
  /** The key span a `near` mark overlapped — the one key position a failed check shows. */
  keyStart?: number;
  keyEnd?: number;
}

/** One span of the key, on a reveal only. */
export interface KeySpan extends CharRange {
  n: number;
  why?: string;
}

/** The server's word on one question — the rail and «which next» are drawn from these. */
export interface QuestionState {
  questionId: string;
  checks: number;
  firstScore: number | null;
  firstPassed: boolean | null;
  passed: boolean;
  revealed: boolean;
  closed: boolean;
}

/** `details` of a submit, as plan 67 phase 4 contracted it for the runners. */
export interface HighlightInTextVerdict {
  questionId: string;
  /** This question, this check — on a reveal, the first check's. */
  pct: number;
  passed: boolean;
  exact: number;
  near: number;
  /** A count, never positions (AC-S5). */
  miss: number;
  fp: number;
  total: number;
  cells: VerdictCell[];
  missHint?: string;
  fpHint?: string;
  key?: KeySpan[];
  attempt: number;
  /** `null` — no limit. */
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  questions: QuestionState[];
  /** Whether this submit closed the last open question, and with it the attempt. */
  complete: boolean;
  attemptPct: number;
  attemptPassed: boolean;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readRange(value: Record<string, unknown>): CharRange | null {
  const { start, end } = value;
  if (typeof start !== 'number' || typeof end !== 'number' || !(end > start))
    return null;
  return { start, end };
}

export function readQuestionStates(value: unknown): QuestionState[] {
  if (!Array.isArray(value)) return [];
  const out: QuestionState[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.questionId !== 'string') continue;
    out.push({
      questionId: entry.questionId,
      checks: num(entry.checks),
      firstScore:
        typeof entry.firstScore === 'number' ? entry.firstScore : null,
      firstPassed:
        typeof entry.firstPassed === 'boolean' ? entry.firstPassed : null,
      passed: entry.passed === true,
      revealed: entry.revealed === true,
      closed: entry.closed === true,
    });
  }
  return out;
}

/** Read `details` of a submit; `null` when it is not this template's verdict. */
export function readHighlightInTextVerdict(
  value: unknown,
): HighlightInTextVerdict | null {
  if (!isRecord(value)) return null;
  if (typeof value.questionId !== 'string') return null;
  if (!Array.isArray(value.cells) || !Array.isArray(value.questions))
    return null;

  const cells: VerdictCell[] = [];
  for (const c of value.cells as unknown[]) {
    if (!isRecord(c)) continue;
    const range = readRange(c);
    if (range === null) continue;
    const state: CellState =
      c.state === 'exact' ? 'exact' : c.state === 'near' ? 'near' : 'fp';
    const cell: VerdictCell = { ...range, state };
    if (typeof c.keyStart === 'number' && typeof c.keyEnd === 'number') {
      cell.keyStart = c.keyStart;
      cell.keyEnd = c.keyEnd;
    }
    cells.push(cell);
  }

  let key: KeySpan[] | undefined;
  if (Array.isArray(value.key)) {
    key = [];
    for (const k of value.key as unknown[]) {
      if (!isRecord(k)) continue;
      const range = readRange(k);
      if (range === null) continue;
      key.push({
        ...range,
        n: num(k.n, key.length + 1),
        ...(typeof k.why === 'string' && k.why.trim() !== ''
          ? { why: k.why }
          : {}),
      });
    }
  }

  return {
    questionId: value.questionId,
    pct: num(value.pct),
    passed: value.passed === true,
    exact: num(value.exact),
    near: num(value.near),
    miss: num(value.miss),
    fp: num(value.fp),
    total: num(value.total),
    cells,
    ...(typeof value.missHint === 'string' ? { missHint: value.missHint } : {}),
    ...(typeof value.fpHint === 'string' ? { fpHint: value.fpHint } : {}),
    ...(key !== undefined ? { key } : {}),
    attempt: num(value.attempt, 1),
    checksLeft: typeof value.checksLeft === 'number' ? value.checksLeft : null,
    closed: value.closed === true,
    revealed: value.revealed === true,
    questions: readQuestionStates(value.questions),
    complete: value.complete === true,
    attemptPct: num(value.attemptPct),
    attemptPassed: value.attemptPassed === true,
  };
}

/* ── The student's marks ───────────────────────────────────────────────────── */

/** The student's marks on one question — token runs, never overlapping, in text order. */
export type StudentMarks = readonly TokenRun[];

/**
 * A tap or a drag toggled `origin…end`.
 *
 * A single token on an existing mark removes that whole mark (AC-S2). Anything else becomes
 * one mark — the origin alone under `unit: 'word'`, the run cut at the origin's paragraph
 * under `phrase` (AC-S3) — and replaces every mark it touches.
 */
export function toggleMark(
  marks: StudentMarks,
  origin: number,
  end: number,
  unit: Unit,
  paragraphOf: readonly number[],
): TokenRun[] {
  if (paragraphOf[origin] === undefined) return [...marks];
  const reach =
    unit === 'word' || paragraphOf[end] === undefined ? origin : end;
  const run = clampToParagraph(paragraphOf, origin, reach);

  if (run.t0 === run.t1) {
    const hit = marks.find(m => m.t0 <= run.t0 && run.t0 <= m.t1);
    if (hit !== undefined) return marks.filter(m => m !== hit);
  }

  const kept = marks.filter(m => m.t1 < run.t0 || m.t0 > run.t1);
  return [...kept, run].sort((a, b) => a.t0 - b.t0);
}

/**
 * «Try again» — keep exactly the marks the server called `exact`, clear the rest (AC-S6).
 * Read off the verdict's cells: they are the marks as the server snapped and merged them.
 */
export function keepExact(
  marks: StudentMarks,
  cells: readonly VerdictCell[],
  tokens: readonly Token[],
): TokenRun[] {
  const exact = cells
    .filter(c => c.state === 'exact')
    .map(c => toTokenRun(tokens, c))
    .filter((r): r is TokenRun => r !== null);
  return marks.filter(m => exact.some(r => r.t0 === m.t0 && r.t1 === m.t1));
}

/** The body of `submittedAnswer` — a check of the question's marks, or a reveal. */
export function buildHighlightInTextSubmission(
  questionId: string,
  marks: StudentMarks,
  tokens: readonly Token[],
  reveal: boolean,
): { questionId: string; marks: CharRange[]; reveal?: true } {
  if (reveal) return { questionId, marks: [], reveal: true };
  return { questionId, marks: marks.map(m => toCharRange(tokens, m)) };
}

/* ── What each token shows ─────────────────────────────────────────────────── */

export type MarkState = 'sel' | 'ok' | 'fp' | 'near' | 'miss' | 'key';

/** One token's look: its state, and the run it belongs to (`k`) for drawing run edges. */
export interface MarkCell {
  m: MarkState;
  k: string;
  /** The key's boundary under a `near` mark — drawn as an underline. */
  keyLine?: boolean;
}

export interface PassageCells {
  cells: Map<number, MarkCell>;
  /** Ordinals on the first token of each key span, on a reveal. */
  numbers: Map<number, number>;
}

/**
 * The look of every token, from whichever state the question is in (BEHAVIOR §6).
 *
 * - **marking** — the student's own marks, `sel`;
 * - **checked** — the cells as the server returned them: `exact` → `ok`, `fp`, `near`. A
 *   `near` mark also draws the key span it overlapped — the key's tokens underlined, those
 *   the mark left out drawn `miss` (plan 67 phase 5, decision 4);
 * - **revealed** — the whole key in `key`, each span numbered.
 */
export function passageCells(
  marks: StudentMarks,
  verdict: HighlightInTextVerdict | null,
  tokens: readonly Token[],
): PassageCells {
  const cells = new Map<number, MarkCell>();
  const numbers = new Map<number, number>();
  const paint = (run: TokenRun, cell: MarkCell) => {
    for (let i = run.t0; i <= run.t1; i++) cells.set(i, cell);
  };

  if (verdict !== null && verdict.revealed && verdict.key !== undefined) {
    for (const span of verdict.key) {
      const run = toTokenRun(tokens, span);
      if (run === null) continue;
      paint(run, { m: 'key', k: `key${span.n}` });
      numbers.set(run.t0, span.n);
    }
    return { cells, numbers };
  }

  if (verdict !== null) {
    verdict.cells.forEach((c, index) => {
      const run = toTokenRun(tokens, c);
      if (run === null) return;
      paint(run, { m: c.state === 'exact' ? 'ok' : c.state, k: `c${index}` });
    });
    verdict.cells.forEach((c, index) => {
      if (
        c.state !== 'near' ||
        c.keyStart === undefined ||
        c.keyEnd === undefined
      )
        return;
      const key = toTokenRun(tokens, { start: c.keyStart, end: c.keyEnd });
      if (key === null) return;
      const k = `c${index}`;
      for (let i = key.t0; i <= key.t1; i++) {
        const here = cells.get(i);
        if (here === undefined) cells.set(i, { m: 'miss', k, keyLine: true });
        else if (here.k === k) cells.set(i, { ...here, keyLine: true });
      }
    });
    return { cells, numbers };
  }

  for (const m of marks) paint(m, { m: 'sel', k: `m${m.t0}` });
  return { cells, numbers };
}

/**
 * Whether the gap after token `i` is painted — inside a run it carries the run's look, on
 * the edge it does not (AC-M2). Two touching marks are two runs, so the gap between them is
 * bare.
 */
export function gapInsideRun(
  cells: ReadonlyMap<number, MarkCell>,
  i: number,
): boolean {
  const here = cells.get(i);
  const next = cells.get(i + 1);
  return here !== undefined && next !== undefined && here.k === next.k;
}

/* ── Where the questions stand ─────────────────────────────────────────────── */

/** Per question of the passage: closed — passed, revealed or out of checks (AC-S12). */
export function completedOf(
  questions: readonly ProjectedQuestion[],
  states: readonly QuestionState[],
): boolean[] {
  return questions.map(
    q => states.find(s => s.questionId === q.id)?.closed === true,
  );
}

/**
 * Where a resumed attempt opens: the first question still open, on the check after the last
 * one it spent. Marks of an unchecked question were never on the server and are not restored.
 */
export function resumeAt(
  questions: readonly ProjectedQuestion[],
  states: readonly QuestionState[],
): { index: number; attempt: number } {
  const open = questions.findIndex(
    q => states.find(s => s.questionId === q.id)?.closed !== true,
  );
  const index = open === -1 ? 0 : open;
  const here = states.find(s => s.questionId === questions[index]?.id);
  return { index, attempt: (here?.checks ?? 0) + 1 };
}

/**
 * «Next question» — the next question still open after `from`, wrapping round to the ones
 * before it (a resumed attempt may have left an earlier one open). `null` when none is.
 */
export function nextOpen(
  questions: readonly ProjectedQuestion[],
  states: readonly QuestionState[],
  from: number,
): { index: number; attempt: number } | null {
  for (let step = 1; step < questions.length; step++) {
    const index = (from + step) % questions.length;
    const state = states.find(s => s.questionId === questions[index]?.id);
    if (state?.closed !== true)
      return { index, attempt: (state?.checks ?? 0) + 1 };
  }
  return null;
}

/* ── Where a finger is ─────────────────────────────────────────────────────── */

/** A token's box in the passage's own coordinates. */
export interface TokenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The token under a point of the passage, for a drag (plan 67 Q5-A).
 *
 * A finger between two words or past the end of a line still means a word: the line is
 * the one whose band the point is in (or the nearest band), and on that line the nearest
 * token. `null` only when nothing has been measured.
 */
export function tokenAtPoint(
  rects: ReadonlyMap<number, TokenRect>,
  x: number,
  y: number,
): number | null {
  let best: number | null = null;
  let bestLine = Infinity;
  let bestX = Infinity;
  for (const [i, r] of rects) {
    const dy =
      y < r.y ? r.y - y : y > r.y + r.height ? y - (r.y + r.height) : 0;
    const dx = x < r.x ? r.x - x : x > r.x + r.width ? x - (r.x + r.width) : 0;
    if (dy < bestLine || (dy === bestLine && dx < bestX)) {
      best = i;
      bestLine = dy;
      bestX = dx;
    }
  }
  return best;
}
