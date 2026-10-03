/**
 * Pure mapping logic for `multiple_choice_group` — a table of statements sharing one set
 * of answer columns, answered and checked as one block (plan 54).
 *
 * What arrives here is never the stored document but a **projection** of it
 * (shared-kernel `multiple-choice-group/projection.ts`, applied by content-service's
 * `studentSafeContent`): which column each statement belongs in, the author's line and the
 * quote that proves it all stay on the server, in the other column. The row order arrives
 * already shuffled — re-shuffling here would shuffle what the network tab has shown in
 * order (plan 54 §3.5).
 *
 * The quote is the least obvious of the three. It is the line of the passage that proves
 * the statement — the answer written in the author's own words — so a projection that
 * carried quotes would hand the key over row by row without ever naming a column id.
 *
 * Nothing on this side grades, and nothing on this side could. The mechanism of the type
 * is *dosing*: a check reports which statements are wrong and nothing more, and only a
 * **closed** table carries the right column, the line and the quote. A retry offered by a
 * device already holding the key is decoration (plan 54 §3.2).
 *
 * The old form is still live — `content.items[]`, each with its own question and possibly
 * its own options, graded by the engine's `multiple-choice-group-legacy.ts`. It was never
 * playable on this device and is not made playable here: `isMultipleChoiceGroupDocument`
 * tells the two apart by the shape of the document, on this side exactly as on the server,
 * and an old one falls through to the unsupported-template placeholder as it does today.
 */

/* ── The projected table ─────────────────────────────────────────────────── */

/** One answer column, shared by every row. Columns are never shuffled or reordered. */
export interface ProjectedColumn {
  id: string;
  label: string;
}

/** One statement as the runner receives it — never a hint at which column is right. */
export interface ProjectedRow {
  id: string;
  text: string;
}

/** Where the statements came from, as far as the student is concerned. */
export interface ProjectedSource {
  mode: 'none' | 'inline' | 'link';
  label: string;
  /** Present in `inline` mode with `showText` on, and only then. */
  text?: string;
  /** Present in `link` mode when the author picked a lesson. */
  lessonId?: string;
}

/**
 * The settings that change what the student sees or may do.
 *
 * `shuffleRows` is deliberately absent — it is already applied to the order that arrived.
 * So are `lockCorrect`, `revealKey` and `showWhy`: all three decide what the *server* puts
 * in a check result, and a client acting on them could unfreeze a row the server froze or
 * draw a key it was not sent.
 *
 * `layout` is carried and then ignored on this device, which is always cards — a phone is
 * the case `layout: 'auto'` already resolves to (README, "Phone or `layout: 'cards'`").
 */
export interface MultipleChoiceGroupSettings {
  numbering: boolean;
  layout: 'auto' | 'cards';
  /** The check budget: `none` → 1 check, `one` → 2, `unlimited` → 99. */
  retry: 'none' | 'one' | 'unlimited';
  progress: boolean;
  showText: boolean;
  /** The share of rows needed to pass, as a percentage. Compared with `>=`. */
  passThreshold: number;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface MultipleChoiceGroupTable {
  instruction: string;
  source: ProjectedSource;
  columns: ProjectedColumn[];
  rows: ProjectedRow[];
  settings: MultipleChoiceGroupSettings;
}

/** Mirrors the kernel's `DEFAULT_SETTINGS` — the values an author starts from. */
const DEFAULT_SETTINGS: MultipleChoiceGroupSettings = {
  numbering: true,
  layout: 'auto',
  retry: 'one',
  progress: true,
  showText: true,
  passThreshold: 70,
};

/**
 * Which form this document is written in — the kernel's own test (`persistence.ts`), word
 * for word: `rows` being an array and nothing else. An old document has `items` and no
 * such field; a new one always has it, even while empty.
 */
export function isMultipleChoiceGroupDocument(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  return Array.isArray((content as { rows?: unknown }).rows);
}

/**
 * Accept the table only if what arrived is the student projection.
 *
 * The key for this template is `rows[].answer`, and it lives in the other column
 * entirely. So does `why`, and so does `quote` — see the note on the module. A row that
 * arrives carrying any of the three is the stored document, not the projection: a
 * content-service older than plan 54 phase 2, or a route that reached for the authoring
 * copy.
 *
 * The answer to that is to refuse, not to strip the three fields here. Stripping would
 * leave a runner that works, a table whose retry and «Vis fasit» are decoration, and
 * nothing on any screen to say the key had been sent (plan 50's finding; plans 51, 53 and
 * the web side of this one repeat it).
 */
export function readMultipleChoiceGroupTable(value: unknown): MultipleChoiceGroupTable | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as {
    instruction?: unknown;
    source?: unknown;
    columns?: unknown;
    rows?: unknown;
    settings?: unknown;
  };
  if (!Array.isArray(raw.rows) || !Array.isArray(raw.columns)) return null;

  const columns: ProjectedColumn[] = [];
  for (const entry of raw.columns) {
    if (typeof entry !== 'object' || entry === null) return null;
    const c = entry as Record<string, unknown>;
    const id = c.id;
    const label = c.label;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof label !== 'string' || label.trim() === '') return null;
    columns.push({ id, label });
  }

  // Fewer than two columns is not a leak but an unanswerable table, and the projection
  // already refuses to build one. One arriving here means the two sides disagree about
  // what is deliverable, which is worth refusing rather than rendering.
  if (columns.length < 2) return null;

  const rows: ProjectedRow[] = [];
  for (const entry of raw.rows) {
    if (typeof entry !== 'object' || entry === null) return null;
    const r = entry as Record<string, unknown>;

    if ('answer' in r || 'why' in r || 'quote' in r) return null;

    const id = r.id;
    const text = r.text;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof text !== 'string' || text.trim() === '') return null;
    rows.push({ id, text });
  }

  return {
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    source: readSource(raw.source),
    columns,
    rows,
    settings: readSettings(raw.settings),
  };
}

/**
 * The passage, as far as the student is entitled to it.
 *
 * `text` is present only when the author attached one *and* left `showText` on — the
 * projection withholds it otherwise rather than sending it with a flag saying "do not draw
 * this", which is the same text one devtools tab away. So its presence is the whole
 * decision here; `settings.showText` is not consulted a second time.
 */
function readSource(raw: unknown): ProjectedSource {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = s.mode;
  const text = s.text;
  const lessonId = s.lessonId;

  return {
    mode: mode === 'inline' || mode === 'link' ? mode : 'none',
    label: typeof s.label === 'string' ? s.label : '',
    ...(typeof text === 'string' && text.trim() !== '' ? { text } : {}),
    ...(typeof lessonId === 'string' && lessonId !== '' ? { lessonId } : {}),
  };
}

/**
 * The settings the runner arranges itself by, each falling back to the author's own
 * default rather than to a guess.
 *
 * Listed field by field rather than spread, for the reason given on the interface: the
 * kernel's `Settings` holds four more, and spreading whatever arrived would quietly
 * re-admit them.
 */
function readSettings(raw: unknown): MultipleChoiceGroupSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  const layout = s.layout;
  const retry = s.retry;
  const passThreshold = s.passThreshold;

  return {
    numbering: bool(s.numbering, DEFAULT_SETTINGS.numbering),
    layout: layout === 'cards' ? 'cards' : 'auto',
    retry:
      retry === 'none' || retry === 'one' || retry === 'unlimited' ? retry : DEFAULT_SETTINGS.retry,
    progress: bool(s.progress, DEFAULT_SETTINGS.progress),
    showText: bool(s.showText, DEFAULT_SETTINGS.showText),
    passThreshold:
      typeof passThreshold === 'number' && Number.isFinite(passThreshold)
        ? passThreshold
        : DEFAULT_SETTINGS.passThreshold,
  };
}

/* ── The verdict ─────────────────────────────────────────────────────────── */

/**
 * One statement's outcome in a check.
 *
 * The optional fields are the contract, not politeness. `keyColumnId` arrives **only once
 * the table is closed** — every row right, revealed, or out of checks — and only when the
 * author left the key visible; a right column shown beside a row that still has a retry
 * left would make the retry theatre. `why` and `quote` follow `showWhy`, and a row the
 * author wrote neither for sends neither. Nothing here fills them in.
 */
export interface MultipleChoiceGroupItemResult {
  itemId: string;
  /** The column picked; `null` when the statement was left unanswered. */
  submitted: string | null;
  correct: boolean;
  /** What was picked on the *first* check of this table, carried forward by the engine. */
  firstAnswer: string | null;
  keyColumnId?: string;
  why?: string;
  quote?: string;
}

/**
 * `details` of a `multiple_choice_group` submission — the state of the table after a
 * check, which is all the runner draws from.
 *
 * `closed` and `locked` are the two the runner may not second-guess. `closed` says no
 * further check is possible, and the engine refuses one whatever the budget says — so a
 * runner offering «Prøv de feile igjen» after it would be offering a refusal. `locked` is
 * the cumulative set of rows the server froze under `lockCorrect`; it survives a retry,
 * which is why the runner holds it apart from the verdict.
 */
export interface MultipleChoiceGroupVerdict {
  totalItems: number;
  passedItems: number;
  /** 1-based: which check of the table this was. */
  attempt: number;
  attemptsLeft: number;
  closed: boolean;
  locked: string[];
  items: MultipleChoiceGroupItemResult[];
}

/**
 * Read the server's verdict for one check.
 *
 * Defensive in the same direction as the projection reader: a verdict without the fields
 * that say how the table now stands is no verdict, and guessing `closed` either way would
 * either strand the learner on a finished table or offer a check the engine will refuse.
 * The optional fields are copied only when they are there — a `keyColumnId` that did not
 * arrive is a table that is not over, and nothing here may stand in for it.
 */
export function readMultipleChoiceGroupVerdict(value: unknown): MultipleChoiceGroupVerdict | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.closed !== 'boolean') return null;
  if (!Array.isArray(raw.items)) return null;

  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;

  const items: MultipleChoiceGroupItemResult[] = [];
  for (const entry of raw.items) {
    if (typeof entry !== 'object' || entry === null) return null;
    const i = entry as Record<string, unknown>;

    const itemId = i.itemId;
    if (typeof itemId !== 'string' || itemId === '') return null;
    if (typeof i.correct !== 'boolean') return null;

    const keyColumnId = str(i.keyColumnId);
    const why = str(i.why);
    const quote = str(i.quote);

    items.push({
      itemId,
      submitted: typeof i.submitted === 'string' && i.submitted !== '' ? i.submitted : null,
      correct: i.correct,
      firstAnswer: typeof i.firstAnswer === 'string' && i.firstAnswer !== '' ? i.firstAnswer : null,
      ...(keyColumnId === undefined ? {} : { keyColumnId }),
      ...(why === undefined ? {} : { why }),
      ...(quote === undefined ? {} : { quote }),
    });
  }

  const locked = Array.isArray(raw.locked)
    ? raw.locked.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];

  return {
    totalItems: num(raw.totalItems, items.length),
    passedItems: num(raw.passedItems, items.filter(i => i.correct).length),
    attempt: Math.max(1, num(raw.attempt, 1)),
    attemptsLeft: Math.max(0, num(raw.attemptsLeft, 0)),
    closed: raw.closed,
    locked,
    items,
  };
}

/* ── What goes up ────────────────────────────────────────────────────────── */

/** The `submittedAnswer` of one check of the table. */
export interface MultipleChoiceGroupSubmission {
  /** `rowId → columnId`. A row left unanswered is simply absent. */
  answers: Record<string, string>;
  /** «Vis fasit»: the table closes with the score it already had. */
  reveal?: boolean;
}

/**
 * The whole table, every time, because the unit of work is the table.
 *
 * Nothing else is sent. Which check this is, which rows are frozen and what was picked the
 * first time round are facts about the attempt, and the engine writes its own over
 * anything a client puts in their place — a client stating its own check number would be
 * buying itself another go (plan 54 phase 2).
 */
export function buildMultipleChoiceGroupSubmission(
  answers: Record<string, string>,
  reveal = false,
): MultipleChoiceGroupSubmission {
  return { answers, ...(reveal ? { reveal: true } : {}) };
}

/** How many statements are still unanswered — the `N igjen` counter, and the Check gate. */
export function unansweredCount(rows: ProjectedRow[], answers: Record<string, string>): number {
  return rows.filter(row => answers[row.id] === undefined).length;
}

/**
 * What survives «Prøv de feile igjen» — R15, and the one place the handoff answers twice.
 *
 * BEHAVIOR's state machine clears the wrong rows always; S3.5 keeps everything when
 * `lockCorrect` is off; and `lockCorrect` is deliberately not in the projection, because a
 * client told `false` could unfreeze rows the server froze. So the answer is derived from
 * the server's `locked` instead:
 *
 *   - a non-empty freeze → the answers to keep are exactly the frozen ones;
 *   - an empty freeze *while some row came out right* → the author turned locking off, and
 *     S3.5 keeps every answer, wrong ones included;
 *   - nothing right and nothing frozen → the one case the two readings share (there is no
 *     correct answer to keep either way), and the wrong picks are cleared, which is what
 *     the button offers to do.
 *
 * Plan 54 §5, deviation 8 — and the same function as the web solver's, so the two
 * platforms cannot drift on it.
 */
export function keepOnRetry(
  answers: Record<string, string>,
  locked: string[],
  items: MultipleChoiceGroupItemResult[],
): Record<string, string> {
  const anyRight = items.some(item => item.correct);
  if (locked.length === 0 && anyRight) return { ...answers };

  const kept: Record<string, string> = {};
  for (const rowId of locked) {
    const held = answers[rowId];
    if (held !== undefined) kept[rowId] = held;
  }
  return kept;
}
