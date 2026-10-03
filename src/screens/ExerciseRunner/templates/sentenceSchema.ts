/**
 * Pure mapping logic for `sentence_schema` — a **set** of sentences laid out on a
 * topological field board (Norwegian "setningsskjema").
 *
 * The wire shape changed with plan 52 (ssz-platform-web/docs/plan/52-sentence-schema.md).
 * A document is now a set of rows over one schema: fields are data rather than Norwegian,
 * a piece is a *chunk* (`I morgen` is one), and the key is which field each chunk belongs
 * in — `chunk.field`, `chunk.alt`, `row.why`, `row.fb` and `row.text`, the sentence in its
 * correct order. What arrives here is never the stored document but a **projection** of it
 * (shared-kernel `sentence-schema/projection.ts`, applied by content-service's
 * `studentSafeContent`): fields, a bank the server has already shuffled, and the prompt.
 *
 * Nothing on this side grades, and nothing on this side could — the key never reaches the
 * device (plan 52 §3.2, §5). A sentence is checked with
 * `POST /exercises/:id/attempts/:attemptId/rows` and the marks come back with it; the last
 * one closes the attempt with the ordinary `submit`, sending every board in one aggregate,
 * which the engine regrades from scratch.
 *
 * That is the difference from the old mobile body, which read `content.fields` /
 * `content.tokens`, sent `placements` and coloured the fields itself from
 * `feedback.correctAnswer`. There is no second form to fall back to: all seven seeded
 * exercises were rewritten (plan 52 §8 Q7), so a document in the old shape is a leftover
 * and is **refused**, exactly as `readShortAnswerSet` refuses one carrying its key.
 */

/* ── The set, as the student receives it ─────────────────────────────────── */

export type ClauseId = 'main' | 'sub' | 'yesno' | 'hv' | 'imp';

const CLAUSE_IDS: readonly ClauseId[] = ['main', 'sub', 'yesno', 'hv', 'imp'];

/** One column of the board. `short` is the key printed on it, `label` its full name. */
export interface SentenceSchemaField {
  id: string;
  short: string;
  label: string;
  hint: string;
  /** May legitimately stay empty — and only such a field draws a `—`. */
  optional: boolean;
}

/** One piece of the bank: a text and an id, nothing else. */
export interface SentenceSchemaItem {
  id: string;
  text: string;
}

/** field id → the ids stacked in it, in the order they were placed. Order is graded. */
export type Placement = Record<string, string[]>;

export interface SentenceSchemaRow {
  id: string;
  clause: ClauseId;
  fields: SentenceSchemaField[];
  /** Chunks and, where the author turned distractors on, the extras — already shuffled. */
  bank: SentenceSchemaItem[];
  /** The sentence to rewrite, for a transformation task. `''` for a plain layout. */
  source: string;
  /** Chunks expected per field, when the author turned counts on. Null otherwise. */
  counts: Record<string, number> | null;
  /** The board the student starts from, per `settings.prefill`. */
  start: Placement;
}

/**
 * The switches that change what this runner draws.
 *
 * A subset of the kernel's `Settings`, named field by field rather than spread: the ones
 * left out (`order`, `prefill`, `shuffle`, `extras`, `counts`, `hintAfterMistake`) are
 * decided on the server and arrive already applied — in the fields, in the bank, in
 * `row.counts`, in `row.start`, in the banner. A runner that read them would be deciding
 * something twice and could only ever disagree.
 *
 * `orderOnly` is carried for the same reason it is on the web: it is a fact about what
 * the exercise asks, worth saying in the instruction. It is **not** what shapes the board
 * — the projection has already collapsed the schema into one nameless slot, and the board
 * follows the fields it was sent (plan 52, phase 4's sixth fix).
 */
export interface SentenceSchemaSettings {
  labels: boolean;
  hints: boolean;
  /** False hides *where* the mistake is, never that there is one (plan 52 §6.8). */
  perField: boolean;
  orderOnly: boolean;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface SentenceSchemaSet {
  title: string;
  instruction: string;
  rows: SentenceSchemaRow[];
  settings: SentenceSchemaSettings;
}

/* ── What comes back from a check ────────────────────────────────────────── */

export type ItemMark = 'ok' | 'field' | 'order' | 'extra';
export type FieldMark = 'ok' | 'bad' | 'empty';

/**
 * The one note under the board, resolved on the server.
 *
 * It has to be: the chain is `row.fb[chunkId]` → a default for the kind of mistake →
 * `row.why`, and the first and last of those are the key. So what travels is the author's
 * words where they wrote some, and otherwise a **code** to render — the handoff writes its
 * defaults as English prose, and this app speaks three languages.
 */
export interface SentenceSchemaBanner {
  source: 'override' | 'default' | 'why';
  text: string;
  code: ItemMark | null;
  /** The rule, repeated under the note from the second attempt on. */
  hint: string;
}

/** One checked sentence, as the student is allowed to receive it back. */
export interface SentenceSchemaResult {
  rowId: string;
  /** Which check this was, 1-based — the «Forsøk N» counter. Counted by the server. */
  attempt: number;
  byItem: Record<string, ItemMark>;
  /** Null when the author turned per-field marking off. */
  byField: Record<string, FieldMark> | null;
  wrong: number;
  solved: boolean;
  score: number;
  /** The rule. Present once the sentence is closed, withheld while it is open. */
  why: string | null;
  /** The sentence in its correct order — the answer as a string. Same rule as `why`. */
  text: string | null;
  /** The full board, on a reveal only. */
  solution: Placement | null;
  banner: SentenceSchemaBanner | null;
}

/** One board as the closing aggregate carries it. */
export interface SentenceSchemaRowSubmission {
  rowId: string;
  placement: Placement;
  /** Shown rather than solved. The engine takes its own record over this. */
  revealed: boolean;
}

export interface SentenceSchemaSubmission {
  rows: SentenceSchemaRowSubmission[];
}

/** Mirrors the kernel's `DEFAULT_SETTINGS` for the four the runner reads. */
const DEFAULT_SETTINGS: SentenceSchemaSettings = {
  labels: true,
  hints: false,
  perField: true,
  orderOnly: false,
};

/* ── Reading the projection ──────────────────────────────────────────────── */

/**
 * Which form this document is written in — the kernel's own test (`persistence.ts`):
 * `rows` being an array and nothing else.
 */
export function isSentenceSchemaDocument(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  return Array.isArray((content as { rows?: unknown }).rows);
}

/**
 * Accept the set only if what arrived is the student projection.
 *
 * The tells are the key's own fields. A row carrying `chunks` is carrying `chunk.field`
 * with them — which field each piece belongs in, the whole answer. A row carrying `text`
 * is carrying the sentence in its correct order, which is the answer written out as a
 * string. `why` and `fb` are the teacher's explanations, owed after a verdict and not
 * before. Any of them means an `exercise-engine` or a content-service older than plan 52.
 *
 * The answer is to refuse, not to strip the key here. Stripping would leave a runner that
 * works, an exercise that is pointless, and nothing on any screen to say the key was ever
 * sent (plan 50's finding, repeated by 51 and by the web's own projection reader).
 *
 * A document that is not a set at all is refused by the first check. Nothing is left on
 * the old form (plan 52 §8 Q7), so one arriving is a leftover — and a board drawn from it
 * would look like an exercise with nothing in it rather than one that needs rewriting.
 */
export function readSentenceSchemaSet(value: unknown): SentenceSchemaSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as {
    title?: unknown;
    instruction?: unknown;
    rows?: unknown;
    settings?: unknown;
  };
  if (!Array.isArray(raw.rows)) return null;

  const rows: SentenceSchemaRow[] = [];
  for (const item of raw.rows) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;

    if ('chunks' in row || 'text' in row || 'why' in row || 'fb' in row) return null;

    const id = row.id;
    if (typeof id !== 'string' || id === '') return null;

    const fields = readFields(row.fields);
    const bank = readBank(row.bank);
    if (fields === null || bank === null) return null;

    const clause = row.clause;
    const source = row.source;

    rows.push({
      id,
      clause: isClause(clause) ? clause : 'main',
      fields,
      bank,
      source: typeof source === 'string' ? source : '',
      counts: readCounts(row.counts),
      start: readPlacement(row.start),
    });
  }

  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    rows,
    settings: readSettings(raw.settings),
  };
}

function isClause(value: unknown): value is ClauseId {
  return typeof value === 'string' && (CLAUSE_IDS as readonly string[]).includes(value);
}

/** The board's columns. A field carrying no id is a document, not a projection. */
function readFields(value: unknown): SentenceSchemaField[] | null {
  if (!Array.isArray(value)) return null;

  const fields: SentenceSchemaField[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const f = item as Record<string, unknown>;
    const id = f.id;
    if (typeof id !== 'string' || id === '') return null;
    fields.push({
      id,
      short: typeof f.short === 'string' ? f.short : '',
      label: typeof f.label === 'string' ? f.label : '',
      hint: typeof f.hint === 'string' ? f.hint : '',
      optional: f.optional === true,
    });
  }
  return fields;
}

/**
 * The pieces, in the order the server shuffled them into. Never reordered here: a bank in
 * sentence order is the answer in order, and a client that arranged it would be arranging
 * something the network had already shown.
 */
function readBank(value: unknown): SentenceSchemaItem[] | null {
  if (!Array.isArray(value)) return null;

  const bank: SentenceSchemaItem[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const i = item as Record<string, unknown>;
    // A piece that says which field it belongs in is the key, arriving one word at a
    // time — and the likeliest shape for it to arrive in.
    if ('field' in i || 'alt' in i) return null;
    const { id, text } = i as { id?: unknown; text?: unknown };
    if (typeof id !== 'string' || id === '' || typeof text !== 'string') return null;
    bank.push({ id, text });
  }
  return bank;
}

/**
 * Expected chunks per field — a partial key, sent only when the author asked for it.
 * Absent is the normal case and reads as "show no numbers", never as zero.
 */
function readCounts(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const counts: Record<string, number> = {};
  for (const [fieldId, n] of Object.entries(value)) {
    if (typeof n === 'number' && Number.isFinite(n)) counts[fieldId] = n;
  }
  return counts;
}

/** A board as it arrives — from `row.start`, from a resumed attempt, or from a reveal. */
export function readPlacement(value: unknown): Placement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const board: Placement = {};
  for (const [fieldId, items] of Object.entries(value)) {
    if (Array.isArray(items)) {
      board[fieldId] = items.filter((item): item is string => typeof item === 'string');
    }
  }
  return board;
}

function readSettings(raw: unknown): SentenceSchemaSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  return {
    labels: bool(s.labels, DEFAULT_SETTINGS.labels),
    hints: bool(s.hints, DEFAULT_SETTINGS.hints),
    perField: bool(s.perField, DEFAULT_SETTINGS.perField),
    orderOnly: bool(s.orderOnly, DEFAULT_SETTINGS.orderOnly),
  };
}

/**
 * Read the server's marks for one sentence.
 *
 * Defensive in the same direction as the projection reader: marks that cannot be read are
 * no marks, and a board coloured from missing ones would tell the learner they were wrong
 * about pieces nobody judged.
 */
export function readSentenceSchemaResult(value: unknown): SentenceSchemaResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const rowId = raw.rowId;
  if (typeof rowId !== 'string' || rowId === '') return null;
  if (typeof raw.solved !== 'boolean') return null;

  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

  return {
    rowId,
    attempt: Math.max(1, num(raw.attempt, 1)),
    byItem: readMarks(raw.byItem, isItemMark),
    byField: raw.byField == null ? null : readMarks(raw.byField, isFieldMark),
    wrong: num(raw.wrong, 0),
    solved: raw.solved,
    score: num(raw.score, 0),
    why: str(raw.why),
    text: str(raw.text),
    solution: raw.solution == null ? null : readPlacement(raw.solution),
    banner: readBanner(raw.banner),
  };
}

function readMarks<M extends string>(
  value: unknown,
  isMark: (v: unknown) => v is M,
): Record<string, M> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const marks: Record<string, M> = {};
  for (const [id, mark] of Object.entries(value)) {
    if (isMark(mark)) marks[id] = mark;
  }
  return marks;
}

function isItemMark(value: unknown): value is ItemMark {
  return value === 'ok' || value === 'field' || value === 'order' || value === 'extra';
}

function isFieldMark(value: unknown): value is FieldMark {
  return value === 'ok' || value === 'bad' || value === 'empty';
}

function readBanner(value: unknown): SentenceSchemaBanner | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;

  const source = b.source;
  if (source !== 'override' && source !== 'default' && source !== 'why') return null;

  const text = typeof b.text === 'string' ? b.text : '';
  const code = isItemMark(b.code) ? b.code : null;
  // A note with neither words nor a code has nothing to say, and an empty banner box
  // under the board reads as a verdict that failed to load.
  if (text === '' && code === null) return null;

  return { source, text, code, hint: typeof b.hint === 'string' ? b.hint : '' };
}

/* ── Moving pieces ───────────────────────────────────────────────────────── */

/**
 * Put a piece into a field — from the bank, or from another field.
 *
 * A piece is in exactly one place, so it is lifted out of wherever it was first. Fields
 * left empty are dropped from the board rather than kept as empty arrays: the board is
 * sent as it stands, and `{ forfelt: [] }` and no `forfelt` at all must not be two things.
 */
export function placeItem(placement: Placement, fieldId: string, itemId: string): Placement {
  const next = withoutItem(placement, itemId);
  next[fieldId] = [...(next[fieldId] ?? []), itemId];
  return next;
}

/** Take a piece back to the bank. */
export function takeItem(placement: Placement, itemId: string): Placement {
  return withoutItem(placement, itemId);
}

function withoutItem(placement: Placement, itemId: string): Placement {
  const next: Placement = {};
  for (const [fieldId, items] of Object.entries(placement)) {
    const kept = items.filter((id) => id !== itemId);
    if (kept.length > 0) next[fieldId] = kept;
  }
  return next;
}

/** The first field with nothing in it, in board order. */
export function firstEmptyField(
  fields: SentenceSchemaField[],
  placement: Placement,
): string | null {
  return fields.find((field) => (placement[field.id] ?? []).length === 0)?.id ?? null;
}

/** Every piece currently on the board. */
export function placedItems(placement: Placement): string[] {
  return Object.values(placement).flat();
}

/**
 * `Rett opp`: keep every piece the server marked right, clear the rest.
 *
 * The whole design of this type is what a learner may do about being wrong, and this is
 * it — unlimited, and never starting from an empty board when four of seven were already
 * where they belong.
 */
export function keepCorrect(placement: Placement, marks: SentenceSchemaResult): Placement {
  const kept: Placement = {};
  for (const [fieldId, items] of Object.entries(placement)) {
    const right = items.filter((id) => marks.byItem[id] === 'ok');
    if (right.length > 0) kept[fieldId] = right;
  }
  return kept;
}

/** Whether this board may be checked: something has to be on it. */
export function canCheckRow(placement: Placement): boolean {
  return placedItems(placement).length > 0;
}

/**
 * The aggregate that closes the attempt.
 *
 * The marks collected along the way are not sent: the validator regrades every board from
 * the current key, which is what makes the score independent of anything this device
 * decided — and the reveals are taken from the attempt's own record rather than from what
 * is sent here, which is what makes it independent of anything this device could claim.
 */
export function buildSentenceSchemaSubmission(
  rows: SentenceSchemaRowSubmission[],
): SentenceSchemaSubmission {
  return {
    rows: rows.map(({ rowId, placement, revealed }) => ({ rowId, placement, revealed })),
  };
}
