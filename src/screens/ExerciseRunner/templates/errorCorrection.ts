/**
 * Pure logic for `error_correction` (plan 41) — `@ssz/shared-kernel/error-correction` as the
 * phone needs it.
 *
 * The learner corrects a faulty sentence word by word: rewrite a word, strike it out (an empty
 * rewrite), or insert one between two words. The answer is those edits, not a rewritten
 * sentence — "which mistake did they find" is then a fact the engine can check. Every index
 * points into the sentence's `words`, so the split here is the kernel's own (`engine.words`):
 * collapse whitespace, split on spaces.
 *
 * The masked projection — `words`, and the hint counts that only the key can produce
 * (`errorCount`, `errorTypes`, `totalErrors`) — arrives as `exerciseContent` when the attempt
 * starts. The display endpoint's raw document carries the sentences without the key, so it is
 * enough to render from until the attempt answers; it only lacks the counts.
 *
 * The engine only ever approves (`error-correction.validator.ts`): all mistakes fixed with no
 * stray edits closes the item, anything else goes to a teacher. Nothing per sentence comes back
 * to the learner.
 */

export type SpanType = 'form' | 'order' | 'extra' | 'missing' | 'spelling' | 'function';

const SPAN_TYPES: readonly SpanType[] = ['form', 'order', 'extra', 'missing', 'spelling', 'function'];

/** The learner's edits to one sentence, keyed by word index (`ins`: by slot, 0…words.length). */
export interface StudentEdits {
  marked: Record<number, boolean>;
  fix: Record<number, string>;
  ins: Record<number, string>;
}

export const EMPTY_EDITS: StudentEdits = { marked: {}, fix: {}, ins: {} };

export interface EcItem {
  id: string;
  wrong: string;
  words: string[];
  hint?: string;
  /** Mistakes in this sentence — only when the author shows counts. */
  errorCount?: number;
  /** Their types, in sentence order — only when the author names them. */
  errorTypes?: SpanType[];
}

export interface EcTask {
  mode: 'sentences' | 'passage';
  note: string;
  items: EcItem[];
  /** Offer æ ø å while a word is being edited. */
  keyboard: boolean;
  /** Mistakes across all sentences — only when the author shows counts. */
  totalErrors?: number;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The kernel's tokenisation (`engine.words`) — every edit index points into this. */
export const words = (text: string): string[] =>
  (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Read the exercise from the attempt's projection when there is one, else from the display
 * document. A sentence with no text is dropped: the engine grades only written ones, and an
 * empty sentence could never be touched, so it would block the hand-in for good.
 */
export function readEcTask(display: unknown, projection: unknown): EcTask {
  const projected = asRecord(projection);
  const source = Array.isArray(projected.items) ? projected : asRecord(display);
  const hints = asRecord(source.hints);
  const flow = asRecord(source.flow);

  const items = (Array.isArray(source.items) ? source.items : [])
    .map((raw, index): EcItem => {
      const item = asRecord(raw);
      const wrong = asString(item.wrong);
      const served = Array.isArray(item.words) && item.words.every((w) => typeof w === 'string');
      const hint = asString(item.hint);
      const errorCount = count(item.errorCount);
      const errorTypes = Array.isArray(item.errorTypes)
        ? item.errorTypes.filter((type): type is SpanType => SPAN_TYPES.includes(type as SpanType))
        : undefined;
      return {
        id: asString(item.id) || `i${index + 1}`,
        wrong,
        words: served ? (item.words as string[]) : words(wrong),
        // The display document carries the author's hint whatever `hints.hintText` says;
        // the projection only when it is on. Honour the switch either way.
        ...(hint !== '' && hints.hintText !== false ? { hint } : {}),
        ...(errorCount !== undefined ? { errorCount } : {}),
        ...(errorTypes !== undefined && errorTypes.length > 0 ? { errorTypes } : {}),
      };
    })
    .filter((item) => item.wrong.trim() !== '');

  const totalErrors = count(source.totalErrors);
  return {
    mode: source.mode === 'passage' ? 'passage' : 'sentences',
    note: asString(source.note),
    items,
    keyboard: flow.keyboard !== false,
    ...(totalErrors !== undefined ? { totalErrors } : {}),
  };
}

const clone = (edits: StudentEdits): StudentEdits => ({
  marked: { ...edits.marked },
  fix: { ...edits.fix },
  ins: { ...edits.ins },
});

/**
 * Rewrite word `index`. The same text as the word is not an edit — leaving it marked would
 * claim a correction the learner did not make. An empty text strikes the word out.
 */
export function rewriteWord(edits: StudentEdits, index: number, word: string, text: string): StudentEdits {
  const next = clone(edits);
  const trimmed = text.trim();
  if (trimmed === word) {
    delete next.marked[index];
    delete next.fix[index];
  } else {
    next.marked[index] = true;
    next.fix[index] = trimmed;
  }
  return next;
}

/** Put the word back as it was. */
export function restoreWord(edits: StudentEdits, index: number): StudentEdits {
  const next = clone(edits);
  delete next.marked[index];
  delete next.fix[index];
  return next;
}

/** Insert a word before word `slot` (`slot === words.length` is the end). Empty removes it. */
export function insertAt(edits: StudentEdits, slot: number, text: string): StudentEdits {
  const next = clone(edits);
  const trimmed = text.trim();
  if (trimmed === '') delete next.ins[slot];
  else next.ins[slot] = trimmed;
  return next;
}

/** How many changes the learner has made to one sentence — the web's count. */
export function changeCount(edits: StudentEdits | undefined): number {
  if (edits === undefined) return 0;
  const marked = Object.values(edits.marked).filter(Boolean).length;
  const inserted = Object.values(edits.ins).filter((word) => word.trim() !== '').length;
  return marked + inserted;
}

export type WordState = 'plain' | 'edited' | 'removed';

export function wordState(edits: StudentEdits | undefined, index: number): WordState {
  if (edits === undefined || edits.marked[index] !== true) return 'plain';
  const fix = edits.fix[index];
  if (fix === undefined) return 'plain';
  return fix.trim() === '' ? 'removed' : 'edited';
}

/** The submission the engine reads: every sentence's edits, by item id. */
export function buildEcAnswer(
  items: EcItem[],
  value: Record<string, StudentEdits>,
): { items: Record<string, StudentEdits> } {
  const out: Record<string, StudentEdits> = {};
  for (const item of items) out[item.id] = value[item.id] ?? EMPTY_EDITS;
  return { items: out };
}

/** Every sentence worked on — the web's rule for handing in. */
export function ecCanSubmit(items: EcItem[], value: Record<string, StudentEdits>): boolean {
  return items.length > 0 && items.every((item) => changeCount(value[item.id]) > 0);
}
