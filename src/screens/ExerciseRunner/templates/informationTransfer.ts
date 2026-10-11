/**
 * Pure mapping logic for `information_transfer` — a blank to fill in from a text or a
 * recording, the whole blank checked as one block (plan 73).
 *
 * What arrives here is never the stored document but a **projection** of it (shared-kernel
 * `information-transfer/projection.ts`, applied by content-service's `studentSafeContent`):
 * the value a field expects, the author's reason for it, which fields are required, the
 * pass mark and the memory settings all stay on the server (plan 73 §3.2). The recording is
 * not here either — it rides on the `audio` block the listening layer reads.
 *
 * Nothing on this side grades, and nothing on this side could. The mechanism is the one
 * `inflection_table` has: a check reports a verdict for every cell, the author's reason for
 * each one not counted, and the standard form or the key only where `revealKey` lets it out.
 * A retry offered by a device already holding the key would be decoration.
 *
 * The same rules as the web solver (`information-transfer-solver.tsx`) and body
 * (`information-transfer-body.tsx`), function for function, so the two platforms cannot
 * drift on what a retry keeps or how a cell is drawn.
 */

/* ── The projected blank ─────────────────────────────────────────────────── */

export type FieldType =
  | 'time'
  | 'date'
  | 'number'
  | 'money'
  | 'phone'
  | 'name'
  | 'word';

const FIELD_TYPES: readonly FieldType[] = [
  'time',
  'date',
  'number',
  'money',
  'phone',
  'name',
  'word',
];

export type SourceKind = 'text' | 'audio';
export type Layout = 'form' | 'table';
export type ShowSource = 'always' | 'afterAnswer';
export type RevealKey = 'immediately' | 'afterLastAttempt' | 'never';

const SOURCE_KINDS: readonly SourceKind[] = ['text', 'audio'];
const LAYOUTS: readonly Layout[] = ['form', 'table'];
const SHOW_SOURCES: readonly ShowSource[] = ['always', 'afterAnswer'];
const REVEAL_KEYS: readonly RevealKey[] = [
  'immediately',
  'afterLastAttempt',
  'never',
];

/** One field of the blank. Never reordered — the author's order is the order on screen. */
export interface ProjectedField {
  id: string;
  /** May be empty: the cell is then «Field N». */
  label: string;
  type: FieldType;
  unit: string;
  placeholder: string;
  /** The keyboard: digits for a number, a time, a phone. */
  numeric: boolean;
  /** The author's hint, shown when `hintsAfter` lets it. */
  hint?: string;
}

/**
 * The settings that change what the student sees or may do. `attempts` is the check budget,
 * 1–3 or 0 for unlimited — the server enforces it, so a wrong reading here only shows a
 * button it then refuses. The pass mark is not here at all: the verdict says `passed`
 * (plan 73, deviation 14).
 */
export interface InformationTransferAnswering {
  showSource: ShowSource;
  oneAtATime: boolean;
  attempts: number;
  revealKey: RevealKey;
  hintsAfter: number;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface InformationTransferProjection {
  title: string;
  instruction: string;
  sourceKind: SourceKind;
  /** The language being learned — the cells' language, for the keyboard. */
  language: string;
  /** Text source only: the passage and its title. */
  passage?: string;
  passageTitle?: string;
  form: { formTitle: string; layout: Layout };
  fields: ProjectedField[];
  answering: InformationTransferAnswering;
}

/**
 * Accept the blank only if what arrived is the student projection.
 *
 * Everything the key is made of lives in the other column: a field that carries `expected`,
 * `why`, `required` or `focus`, a document with the grading or scoring settings, a delivery
 * block that carries the pass mark. Any of them on the wire means the stored document reached
 * the device — a content-service older than plan 73 phase 3, or a route that reached for the
 * authoring copy.
 *
 * The answer is to refuse, not to strip: stripping would leave a runner that works, a verdict
 * that is decoration, and nothing on any screen to say the key had been sent (plan 50's
 * finding; plans 53, 54 and 66–69 repeat it). A text source without its text is unanswerable,
 * not leaky.
 */
export function readInformationTransferProjection(
  value: unknown,
): InformationTransferProjection | null {
  if (!isRecord(value)) return null;
  if ('expected' in value || 'expectedAnswers' in value) return null;
  if ('grading' in value || 'scoring' in value || 'transcript' in value)
    return null;
  if (!Array.isArray(value.fields)) return null;

  const sourceKind = SOURCE_KINDS.find(k => k === value.sourceKind);
  if (sourceKind === undefined) return null;

  const form = isRecord(value.form) ? value.form : {};
  const layout = LAYOUTS.find(l => l === form.layout) ?? 'form';

  const fields: ProjectedField[] = [];
  for (const entry of value.fields) {
    if (!isRecord(entry)) return null;
    if (
      'expected' in entry ||
      'why' in entry ||
      'required' in entry ||
      'focus' in entry
    ) {
      return null;
    }
    const { id, label, type, hint } = entry;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof label !== 'string') return null;
    const fieldType = FIELD_TYPES.find(f => f === type);
    if (fieldType === undefined) return null;
    fields.push({
      id,
      label,
      type: fieldType,
      unit: typeof entry.unit === 'string' ? entry.unit : '',
      placeholder:
        typeof entry.placeholder === 'string' ? entry.placeholder : '',
      numeric: entry.numeric === true,
      ...(typeof hint === 'string' && hint !== '' ? { hint } : {}),
    });
  }

  const answering = readAnswering(value.answering);
  if (answering === null) return null;

  let source: { passage?: string; passageTitle?: string } = {};
  if (sourceKind === 'text') {
    const passage = value.passage;
    if (typeof passage !== 'string' || passage.trim() === '') return null;
    const passageTitle = value.passageTitle;
    source = {
      passage,
      ...(typeof passageTitle === 'string' && passageTitle !== ''
        ? { passageTitle }
        : {}),
    };
  }

  return {
    title: typeof value.title === 'string' ? value.title : '',
    instruction: typeof value.instruction === 'string' ? value.instruction : '',
    sourceKind,
    language: typeof value.language === 'string' ? value.language : '',
    ...source,
    form: {
      formTitle: typeof form.formTitle === 'string' ? form.formTitle : '',
      layout,
    },
    fields,
    answering,
  };
}

/** Field by field rather than spread, so a field the runner has no business with cannot ride in. */
function readAnswering(raw: unknown): InformationTransferAnswering | null {
  const a = isRecord(raw) ? raw : {};
  if ('passPct' in a) return null;

  const attempts = a.attempts;
  const hintsAfter = a.hintsAfter;
  return {
    showSource: SHOW_SOURCES.find(s => s === a.showSource) ?? 'always',
    oneAtATime: a.oneAtATime === true,
    // Out of range reads as the author's smallest budget; the server refuses what it must.
    attempts:
      attempts === 0 || attempts === 1 || attempts === 2 || attempts === 3
        ? attempts
        : 1,
    revealKey: REVEAL_KEYS.find(k => k === a.revealKey) ?? 'afterLastAttempt',
    hintsAfter:
      hintsAfter === 0 || hintsAfter === 1 || hintsAfter === 9 ? hintsAfter : 9,
  };
}

/* ── The verdict ─────────────────────────────────────────────────────────── */

/** The six outcomes of one cell (DECISIONS §2). */
export type CellVerdict =
  | 'ok'
  | 'format'
  | 'typo'
  | 'unread'
  | 'empty'
  | 'wrong';

const CELL_VERDICTS: readonly CellVerdict[] = [
  'ok',
  'format',
  'typo',
  'unread',
  'empty',
  'wrong',
];

/** The verdicts that count: right, right in another spelling, right but for a slip. */
export function counts(verdict: CellVerdict): boolean {
  return verdict === 'ok' || verdict === 'format' || verdict === 'typo';
}

/**
 * One cell's outcome in a check. `why` comes on every check for a cell not counted;
 * `canonical` is the standard form of a `format` verdict or, for a wrong or unread cell, the
 * key — and only where `revealKey` lets it out now; `hint` only under `hintsAfter: 1`.
 */
export interface InformationTransferItemResult {
  /** The field id. */
  itemId: string;
  /** What stood in the cell on this check; empty when it was left empty. */
  value: string;
  verdict: CellVerdict;
  /** Counted now. */
  correct: boolean;
  canonical?: string;
  why?: string;
  hint?: string;
}

/**
 * `details` of an `information_transfer` submission — the blank after a check.
 *
 * `closed` and `locked` are the two the runner may not second-guess: a closed blank refuses a
 * further check whatever budget is left, and `locked` outlives the verdict. `passedItems`,
 * `pct` and `passed` are the first check's — later checks change what is on screen, never
 * the score.
 */
export interface InformationTransferVerdict {
  totalItems: number;
  /** Right on the first check. */
  passedItems: number;
  /** Right now — the progress line. */
  correctNow: number;
  pct: number;
  passed: boolean;
  passPct: number;
  /** Required cells missed on the first check. */
  missedRequired: number;
  /** 1-based: which check of the blank this was. */
  attempt: number;
  /** Checks still allowed, or `null` for unlimited. */
  checksLeft: number | null;
  closed: boolean;
  /** Whether the key of the cells not counted is in this result. */
  revealed: boolean;
  locked: string[];
  items: InformationTransferItemResult[];
}

/**
 * Read the server's verdict for one check.
 *
 * Defensive in the same direction as the blank reader: a verdict without the fields that say
 * how the blank now stands is no verdict, and guessing `closed` either way would either strand
 * the learner on a finished blank or offer a check the engine refuses. The optional fields are
 * copied only when they are there — nothing here may stand in for a key that did not arrive.
 */
export function readInformationTransferVerdict(
  value: unknown,
): InformationTransferVerdict | null {
  if (!isRecord(value)) return null;
  if (typeof value.closed !== 'boolean') return null;
  if (typeof value.passed !== 'boolean') return null;
  if (!Array.isArray(value.items)) return null;

  const items: InformationTransferItemResult[] = [];
  for (const entry of value.items) {
    if (!isRecord(entry)) return null;
    const { itemId } = entry;
    if (typeof itemId !== 'string' || itemId === '') return null;
    if (typeof entry.correct !== 'boolean') return null;
    const verdict = CELL_VERDICTS.find(v => v === entry.verdict);
    if (verdict === undefined) return null;

    const canonical = text(entry.canonical);
    const why = text(entry.why);
    const hint = text(entry.hint);
    items.push({
      itemId,
      value: typeof entry.value === 'string' ? entry.value : '',
      verdict,
      correct: entry.correct,
      ...(canonical === undefined ? {} : { canonical }),
      ...(why === undefined ? {} : { why }),
      ...(hint === undefined ? {} : { hint }),
    });
  }

  const locked = Array.isArray(value.locked)
    ? value.locked.filter(
        (key): key is string => typeof key === 'string' && key !== '',
      )
    : [];

  return {
    totalItems: num(value.totalItems, items.length),
    passedItems: num(value.passedItems, 0),
    correctNow: num(value.correctNow, items.filter(i => i.correct).length),
    pct: num(value.pct, 0),
    passed: value.passed,
    passPct: num(value.passPct, 0),
    missedRequired: num(value.missedRequired, 0),
    attempt: Math.max(1, num(value.attempt, 1)),
    checksLeft:
      typeof value.checksLeft === 'number' && Number.isFinite(value.checksLeft)
        ? Math.max(0, value.checksLeft)
        : null,
    closed: value.closed,
    revealed: value.revealed === true,
    locked,
    items,
  };
}

/**
 * Whether the score line names a missed required cell. The prototype writes it only when
 * «every required cell» is what failed a good percentage; the projection does not carry that
 * setting, so it is read off the verdict: failed, over the mark, a required miss.
 */
export function requiredHeld(verdict: InformationTransferVerdict): boolean {
  return (
    !verdict.passed &&
    verdict.pct >= verdict.passPct &&
    verdict.missedRequired > 0
  );
}

/* ── What goes up ────────────────────────────────────────────────────────── */

/** `fieldId → what was typed`. An empty cell is simply absent. */
export type InformationTransferValues = Record<string, string>;

/** The `submittedAnswer` of one check of the blank. */
export interface InformationTransferSubmission {
  cells: Record<string, string>;
}

/**
 * Every filled cell, every time, frozen ones included: the server keeps a cell it froze, and
 * sending only the new ones would make a check depend on what this device remembers rather
 * than on what the blank says.
 *
 * Nothing else is sent. Which check this is, which cells are frozen and what each held the
 * first time round are facts about the attempt, and the engine writes its own over anything
 * a client puts in their place.
 */
export function buildInformationTransferSubmission(
  values: InformationTransferValues,
): InformationTransferSubmission {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value.trim() !== '') cells[key] = value;
  }
  return { cells };
}

/** Type a value; `''` empties the cell. A frozen cell is not the student's to change. */
export function setCell(
  values: InformationTransferValues,
  locked: readonly string[],
  key: string,
  value: string,
): InformationTransferValues {
  if (locked.includes(key)) return values;
  const next = { ...values };
  if (value === '') delete next[key];
  else next[key] = value;
  return next;
}

/**
 * Whether «Check» has anything to check: a filled cell the server has not frozen. After a
 * retry with nothing but frozen cells filled, a check would only spend the budget.
 */
export function canCheck(
  fields: readonly ProjectedField[],
  values: InformationTransferValues,
  locked: readonly string[],
): boolean {
  return fields.some(
    f => !locked.includes(f.id) && (values[f.id] ?? '').trim() !== '',
  );
}

/**
 * «Rett opp N felt» — exactly the cells the last check did not count are emptied. Frozen
 * cells stay; so does a cell changed since the check, which was neither right nor wrong and
 * is the student's work in progress.
 */
export function keepOnRetry(
  values: InformationTransferValues,
  verdict: InformationTransferVerdict,
  locked: readonly string[],
): InformationTransferValues {
  const wrong = new Set(
    verdict.items
      .filter(item => !item.correct && values[item.itemId] === item.value)
      .map(item => item.itemId),
  );
  const kept: InformationTransferValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (!wrong.has(key) || locked.includes(key)) kept[key] = value;
  }
  return kept;
}

/** The cells the last check did not count — the retry's count. */
export function failures(
  verdict: InformationTransferVerdict | null,
): InformationTransferItemResult[] {
  return verdict === null ? [] : verdict.items.filter(item => !item.correct);
}

/**
 * The cells to restore on a resume: what stood in each, as the last check saw it. Empty
 * cells are not restored — they are simply absent.
 */
export function valuesFromVerdict(
  verdict: InformationTransferVerdict,
): InformationTransferValues {
  return Object.fromEntries(
    verdict.items
      .filter(item => item.value !== '')
      .map(item => [item.itemId, item.value]),
  );
}

/* ── How a cell is drawn ─────────────────────────────────────────────────── */

/** The prototype's `data-s`. `ok` is a cell the server froze or counted; `bad` one it did not. */
export type CellState = 'empty' | 'filled' | 'ok' | 'bad';

export function cellState(
  key: string,
  values: InformationTransferValues,
  outcome: InformationTransferItemResult | undefined,
  locked: readonly string[],
): CellState {
  if (locked.includes(key) || outcome?.correct === true) return 'ok';
  if (outcome !== undefined) return 'bad';
  return (values[key] ?? '').trim() !== '' ? 'filled' : 'empty';
}

/** The `mark` of a checked cell; one per verdict, none before a check. */
export type MarkKey = 'ok' | 'typo' | 'unread' | 'empty' | 'wrong';

export function markKey(verdict: CellVerdict): MarkKey {
  switch (verdict) {
    case 'ok':
    case 'format':
      return 'ok';
    case 'typo':
      return 'typo';
    case 'unread':
      return 'unread';
    case 'empty':
      return 'empty';
    case 'wrong':
      return 'wrong';
  }
}

/**
 * The outcome the shell records for a closed blank: the engine's own `passed` — the first
 * check against the author's pass mark — rather than `correct`, which for this template means
 * «every cell right now». Recording `correct` would count a blank passed at 80 % as a wrong
 * item in the set's results, under the body's own «Passed» (the `inflection_table` and
 * `dictation` precedent).
 */
export function closingVerdict<T extends { correct: boolean }>(
  response: T,
  verdict: InformationTransferVerdict,
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
