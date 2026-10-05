/**
 * Pure mapping logic for `inflection_table` — a paradigm table of lemmas × forms, the whole
 * table checked as one block (plan 69).
 *
 * What arrives here is never the stored document but a **projection** of it (shared-kernel
 * `inflection-table/projection.ts`, applied by content-service's `studentSafeContent`): the
 * form an asked cell expects, its accepted variants, the author's reason for it and the pass
 * mark all stay on the server, in the other column (plan 69 §3.2). What an asked cell may
 * show before a check is its first letter, and only when the author turned that hint on —
 * cut on the server, so the form itself never travels. Rows and the bank are dealt in a
 * fresh order there too.
 *
 * Nothing on this side grades, and nothing on this side could. The mechanism is the one
 * `sort_into_buckets` has (plan 69 §3.4): a check reports which cells are wrong, how near a
 * wrong one came and the author's reason for it; the correct form only when `revealKey`
 * lets it out. A retry offered by a device already holding the key would be decoration.
 *
 * The same rules as the web solver (`inflection-table-solver.tsx`) and body
 * (`inflection-table-body.tsx`), function for function, so the two platforms cannot drift
 * on what a retry keeps or how a cell is drawn.
 */

/* ── The projected table ─────────────────────────────────────────────────── */

/** One column. Never reordered — the paradigm's order is the order on screen. */
export interface ProjectedSlot {
  id: string;
  label: string;
  /** The short label, for a narrow column; the full one when the pack has none. */
  short: string;
}

/**
 * One cell. A given cell carries its form — that is the task. An asked cell carries nothing
 * but, under the author's hint, its first letter.
 */
export type ProjectedCell =
  | { mode: 'prefill'; value: string }
  | { mode: 'ask'; hint?: string };

export interface ProjectedRow {
  id: string;
  lemma: string;
  /** The lemma's translation as the author added it; may be empty. */
  gloss: string;
  /** `slotId → cell`. A slot the row has no cell in is simply absent. */
  cells: Record<string, ProjectedCell>;
}

export type RevealKey = 'afterFirst' | 'afterLast' | 'never';

/**
 * The settings that change what the student sees or may do.
 *
 * `attempts` is the check budget, 1–4 — the server enforces it, so a wrong reading here
 * only shows a button it then refuses. `revealKey` decides how much of the key the *server*
 * sends; it is read for nothing here but kept so the shape matches the web's. The pass mark
 * is not here at all: the verdict says `passed` (plan 69, deviation 15).
 */
export interface InflectionTableSettings {
  input: 'type' | 'bank';
  attempts: number;
  revealKey: RevealKey;
  /** Whether a row's chip («whole row» / «k/n») is drawn after a check. */
  rowVerdict: boolean;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface InflectionTableProjection {
  instruction: string;
  /** The language being learned — the cells' language, for the keyboard. */
  language: string;
  paradigm: { id: string; label: string; lemmaLabel: string };
  slots: ProjectedSlot[];
  rows: ProjectedRow[];
  /** Bank mode only: the forms to pick from, keys and distractors dealt together. */
  bank?: string[];
  settings: InflectionTableSettings;
}

const REVEAL_KEYS: readonly RevealKey[] = ['afterFirst', 'afterLast', 'never'];

/**
 * Accept the table only if what arrived is the student projection.
 *
 * Everything the key is made of lives in the other column (IT-X2): an asked cell that
 * carries a `value`, a cell or row that carries `accept`, `why` or a `dictId`, a settings
 * block that carries the pass mark. Any of them on the wire means the stored document reached
 * the device — a content-service older than plan 69 phase 3, or a route that reached for the
 * authoring copy.
 *
 * The answer is to refuse, not to strip: stripping would leave a runner that works, a verdict
 * that is decoration, and nothing on any screen to say the key had been sent (plan 50's
 * finding; plans 53, 54, 66 and 67 repeat it).
 */
export function readInflectionTableProjection(
  value: unknown,
): InflectionTableProjection | null {
  if (!isRecord(value)) return null;
  if ('expected' in value || 'expectedAnswers' in value) return null;
  if (!Array.isArray(value.slots) || !Array.isArray(value.rows)) return null;

  const slots: ProjectedSlot[] = [];
  for (const entry of value.slots) {
    if (!isRecord(entry)) return null;
    const { id, label, short } = entry;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof label !== 'string' || label === '') return null;
    slots.push({
      id,
      label,
      short: typeof short === 'string' && short !== '' ? short : label,
    });
  }
  // One column is a short answer, not a table; the projection never deals fewer than two.
  if (slots.length < 2) return null;
  const slotIds = new Set(slots.map(s => s.id));

  const rows: ProjectedRow[] = [];
  for (const entry of value.rows) {
    if (!isRecord(entry)) return null;
    if ('dictId' in entry || 'accept' in entry || 'why' in entry) return null;
    const { id, lemma, gloss, cells: rawCells } = entry;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof lemma !== 'string' || lemma === '') return null;
    if (!isRecord(rawCells)) return null;

    const cells: Record<string, ProjectedCell> = {};
    for (const [slotId, raw] of Object.entries(rawCells)) {
      if (!slotIds.has(slotId)) continue;
      if (!isRecord(raw)) return null;
      if ('accept' in raw || 'why' in raw) return null;

      if (raw.mode === 'prefill') {
        if (typeof raw.value !== 'string') return null;
        cells[slotId] = { mode: 'prefill', value: raw.value };
      } else if (raw.mode === 'ask') {
        // The key. The only thing an asked cell may add is the first letter.
        if ('value' in raw) return null;
        const hint = raw.hint;
        cells[slotId] =
          typeof hint === 'string' && hint !== ''
            ? { mode: 'ask', hint }
            : { mode: 'ask' };
      } else {
        return null;
      }
    }
    rows.push({
      id,
      lemma,
      gloss: typeof gloss === 'string' ? gloss : '',
      cells,
    });
  }

  const settings = readSettings(value.settings);
  if (settings === null) return null;

  let bank: string[] | undefined;
  if (settings.input === 'bank') {
    // A bank-mode table with no bank is unanswerable, not leaky.
    const rawBank = value.bank;
    if (
      !Array.isArray(rawBank) ||
      !rawBank.every((f): f is string => typeof f === 'string')
    )
      return null;
    bank = rawBank;
  }

  const paradigm = isRecord(value.paradigm) ? value.paradigm : {};
  return {
    instruction: typeof value.instruction === 'string' ? value.instruction : '',
    language: typeof value.language === 'string' ? value.language : '',
    paradigm: {
      id: typeof paradigm.id === 'string' ? paradigm.id : '',
      label: typeof paradigm.label === 'string' ? paradigm.label : '',
      lemmaLabel:
        typeof paradigm.lemmaLabel === 'string' ? paradigm.lemmaLabel : '',
    },
    slots,
    rows,
    ...(bank === undefined ? {} : { bank }),
    settings,
  };
}

/** Field by field rather than spread, so a field the runner has no business with cannot ride in. */
function readSettings(raw: unknown): InflectionTableSettings | null {
  const s = isRecord(raw) ? raw : {};
  if ('threshold' in s) return null;

  const attempts = s.attempts;
  const reveal = s.revealKey;
  return {
    input: s.input === 'bank' ? 'bank' : 'type',
    // Out of range reads as the author's smallest budget; the server refuses what it must.
    attempts:
      typeof attempts === 'number' &&
      Number.isInteger(attempts) &&
      attempts >= 1 &&
      attempts <= 4
        ? attempts
        : 1,
    revealKey: REVEAL_KEYS.find(k => k === reveal) ?? 'afterLast',
    rowVerdict: s.rowVerdict !== false,
  };
}

/** The cell key as the engine spells it: `rowId:slotId`. */
export function cellKey(rowId: string, slotId: string): string {
  return `${rowId}:${slotId}`;
}

/** Every asked cell, row by row in the dealt order — what the score is out of. */
export function askedKeys(projection: InflectionTableProjection): string[] {
  return projection.rows.flatMap(row =>
    projection.slots
      .filter(slot => row.cells[slot.id]?.mode === 'ask')
      .map(slot => cellKey(row.id, slot.id)),
  );
}

/* ── The verdict ─────────────────────────────────────────────────────────── */

/** Why a wrong form came close: a letter without its diacritic, or the right stem. */
export type NearMiss = 'diacritic' | 'ending';

/**
 * One cell's outcome in a check. `near` and `why` come on every check for a wrong cell
 * (DECISIONS §3); `correctForm` only when `revealKey` lets the key out now.
 */
export interface InflectionTableItemResult {
  /** `rowId:slotId`. */
  itemId: string;
  rowId: string;
  slotId: string;
  /** What stood in the cell on this check; empty when it was left empty. */
  value: string;
  /** Right now. */
  correct: boolean;
  /** Right on the first check — what the score counts. */
  firstCorrect: boolean;
  firstAnswer: string;
  near?: NearMiss;
  why?: string;
  correctForm?: string;
}

/** The row grain: recorded on every check, drawn only under `settings.rowVerdict`. */
export interface InflectionTableRowResult {
  rowId: string;
  asked: number;
  /** Right now. */
  ok: number;
  firstOk: number;
}

/**
 * `details` of an `inflection_table` submission — the table after a check.
 *
 * `closed` and `locked` are the two the runner may not second-guess: a closed table refuses
 * a further check whatever budget is left, and `locked` outlives the verdict. `passedItems`,
 * `pct` and `passed` are the first check's — later checks change what is on screen, never
 * the score.
 */
export interface InflectionTableVerdict {
  totalItems: number;
  /** Right on the first check. */
  passedItems: number;
  /** Right now — the progress line. */
  correctNow: number;
  pct: number;
  passed: boolean;
  /** 1-based: which check of the table this was. */
  attempt: number;
  checksLeft: number;
  closed: boolean;
  locked: string[];
  rows: InflectionTableRowResult[];
  items: InflectionTableItemResult[];
}

/**
 * Read the server's verdict for one check.
 *
 * Defensive in the same direction as the table reader: a verdict without the fields that say
 * how the table now stands is no verdict, and guessing `closed` either way would either
 * strand the learner on a finished table or offer a check the engine refuses. The optional
 * fields are copied only when they are there — nothing here may stand in for a key that did
 * not arrive.
 */
export function readInflectionTableVerdict(
  value: unknown,
): InflectionTableVerdict | null {
  if (!isRecord(value)) return null;
  if (typeof value.closed !== 'boolean') return null;
  if (typeof value.passed !== 'boolean') return null;
  if (!Array.isArray(value.items)) return null;

  const items: InflectionTableItemResult[] = [];
  for (const entry of value.items) {
    if (!isRecord(entry)) return null;
    const { itemId, rowId, slotId } = entry;
    if (typeof itemId !== 'string' || itemId === '') return null;
    if (typeof rowId !== 'string' || typeof slotId !== 'string') return null;
    if (typeof entry.correct !== 'boolean') return null;

    const near =
      entry.near === 'diacritic' || entry.near === 'ending'
        ? entry.near
        : undefined;
    const why = text(entry.why);
    const correctForm = text(entry.correctForm);

    items.push({
      itemId,
      rowId,
      slotId,
      value: typeof entry.value === 'string' ? entry.value : '',
      correct: entry.correct,
      firstCorrect: entry.firstCorrect === true,
      firstAnswer:
        typeof entry.firstAnswer === 'string' ? entry.firstAnswer : '',
      ...(near === undefined ? {} : { near }),
      ...(why === undefined ? {} : { why }),
      ...(correctForm === undefined ? {} : { correctForm }),
    });
  }

  const rows: InflectionTableRowResult[] = [];
  if (Array.isArray(value.rows)) {
    for (const entry of value.rows) {
      if (!isRecord(entry) || typeof entry.rowId !== 'string') continue;
      rows.push({
        rowId: entry.rowId,
        asked: num(entry.asked, 0),
        ok: num(entry.ok, 0),
        firstOk: num(entry.firstOk, 0),
      });
    }
  }

  const locked = Array.isArray(value.locked)
    ? value.locked.filter(
        (key): key is string => typeof key === 'string' && key !== '',
      )
    : [];

  return {
    totalItems: num(value.totalItems, items.length),
    passedItems: num(
      value.passedItems,
      items.filter(i => i.firstCorrect).length,
    ),
    correctNow: num(value.correctNow, items.filter(i => i.correct).length),
    pct: num(value.pct, 0),
    passed: value.passed,
    attempt: Math.max(1, num(value.attempt, 1)),
    checksLeft: Math.max(0, num(value.checksLeft, 0)),
    closed: value.closed,
    locked,
    rows,
    items,
  };
}

/* ── What goes up ────────────────────────────────────────────────────────── */

/** `rowId:slotId → the form typed or placed`. An empty cell is simply absent. */
export type InflectionTableValues = Record<string, string>;

/** The `submittedAnswer` of one check of the table. */
export interface InflectionTableSubmission {
  cells: Record<string, string>;
}

/**
 * Every filled cell, every time, frozen ones included: the server keeps a cell it froze,
 * and sending only the new ones would make a check depend on what this device remembers
 * rather than on what the table says.
 *
 * Nothing else is sent. Which check this is, which cells are frozen and what each held the
 * first time round are facts about the attempt, and the engine writes its own over anything
 * a client puts in their place (plan 69 phase 4).
 */
export function buildInflectionTableSubmission(
  values: InflectionTableValues,
): InflectionTableSubmission {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value.trim() !== '') cells[key] = value;
  }
  return { cells };
}

/** Type or place a form; `null` or `''` empties the cell. A frozen cell is not the student's to change. */
export function setCell(
  values: InflectionTableValues,
  locked: readonly string[],
  key: string,
  value: string | null,
): InflectionTableValues {
  if (locked.includes(key)) return values;
  const next = { ...values };
  if (value === null || value === '') delete next[key];
  else next[key] = value;
  return next;
}

/**
 * Whether «Check» has anything to check: a filled cell the server has not frozen. After a
 * retry with nothing but frozen cells filled, a check would only spend the budget.
 */
export function canCheck(
  keys: readonly string[],
  values: InflectionTableValues,
  locked: readonly string[],
): boolean {
  return keys.some(
    key => !locked.includes(key) && (values[key] ?? '').trim() !== '',
  );
}

/**
 * «Retry the wrong ones» — exactly the cells the last check found wrong are emptied (IT-R4).
 * Frozen cells stay; so does a cell changed since the check, which was neither right nor
 * wrong and is the student's work in progress.
 */
export function keepOnRetry(
  values: InflectionTableValues,
  verdict: InflectionTableVerdict,
  locked: readonly string[],
): InflectionTableValues {
  const wrong = new Set(
    verdict.items
      .filter(item => !item.correct && values[item.itemId] === item.value)
      .map(item => item.itemId),
  );
  const kept: InflectionTableValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (!wrong.has(key) || locked.includes(key)) kept[key] = value;
  }
  return kept;
}

/* ── How the table is drawn ──────────────────────────────────────────────── */

/**
 * How an asked cell is drawn — the prototype's `data-s`. `ok` is a cell the server froze or
 * found right; `bad` one it checked and found wrong (struck through, not only red).
 */
export type CellState = 'empty' | 'filled' | 'ok' | 'bad';

export function cellState(
  key: string,
  values: InflectionTableValues,
  verdict: InflectionTableVerdict | null,
  locked: readonly string[],
): CellState {
  const outcome = verdict?.items.find(item => item.itemId === key);
  if (locked.includes(key) || outcome?.correct === true) return 'ok';
  if (outcome !== undefined) return 'bad';
  return (values[key] ?? '').trim() !== '' ? 'filled' : 'empty';
}

/** The chip beside a row after a check: all its asked cells right, some, or none. */
export interface RowChip {
  tone: 'all' | 'part' | 'none';
  ok: number;
  asked: number;
}

/** `null` when the author turned the row grain off, or before a check. */
export function rowChip(
  verdict: InflectionTableVerdict | null,
  rowVerdict: boolean,
  rowId: string,
): RowChip | null {
  if (!rowVerdict || verdict === null) return null;
  const row = verdict.rows.find(r => r.rowId === rowId);
  if (row === undefined) return null;
  const tone = row.ok === row.asked ? 'all' : row.ok > 0 ? 'part' : 'none';
  return { tone, ok: row.ok, asked: row.asked };
}

/** The cells the last check found wrong — the report's lines and the retry's count. */
export function failures(
  verdict: InflectionTableVerdict | null,
): InflectionTableItemResult[] {
  return verdict === null ? [] : verdict.items.filter(item => !item.correct);
}

/**
 * The outcome the shell records for a closed table: the engine's own `passed` — the first
 * check against the author's pass mark — rather than `correct`, which for this template
 * means «every cell right now». Recording `correct` would count a table passed at 80 % as a
 * wrong item in the set's results, under the body's own «Passed» (plan 68 precedent:
 * `dictation` records the attempt's pass the same way).
 */
export function closingVerdict<T extends { correct: boolean }>(
  response: T,
  verdict: InflectionTableVerdict,
): T {
  return { ...response, correct: verdict.passed };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}
