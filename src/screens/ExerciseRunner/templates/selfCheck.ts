/**
 * The self-check of `translate_*` and `error_correction` — reading what the engine says about
 * work still in progress (`self-check.handler.ts`).
 *
 * Both templates only ever approve on hand-in, so this is the one place a learner hears how
 * close they are before a teacher does. The engine masks it: for a translation, a similarity
 * verdict and a diff whose missing words are `•••`; for a correction, counts of mistakes fixed
 * and left and of edits made where there was none. The budget is the author's
 * (`flow.selfCheck`, 0–5, nothing when the machine check is off) and is counted on the attempt.
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The author's budget, read from the exercise document as the engine reads it. */
export function selfCheckBudget(content: unknown): number {
  const record = asRecord(content);
  if (asRecord(record.check).on === false) return 0;
  const raw = asRecord(record.flow).selfCheck;
  return Math.max(0, Math.min(5, Math.trunc(num(raw, 2))));
}

export interface DiffToken {
  /** `eq` the learner's word as in the key, `extra` not in it, `missing` a key word (masked). */
  t: 'eq' | 'extra' | 'missing';
  w: string;
  typo: string | null;
}

export interface GuardHit {
  text: string;
  note?: string;
}

export type TranslateVerdict = 'exact' | 'typo' | 'near' | 'off' | 'empty' | 'noref';

export interface TranslateSelfCheckItem {
  verdict: TranslateVerdict;
  tokens?: DiffToken[];
  divergingWords?: number;
  missing: GuardHit[];
  banned: GuardHit[];
}

export interface TranslateSelfCheck {
  checksLeft: number;
  passing: number;
  items: Record<string, TranslateSelfCheckItem>;
}

const VERDICTS: readonly TranslateVerdict[] = ['exact', 'typo', 'near', 'off', 'empty', 'noref'];

function readGuards(value: unknown): GuardHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const record = asRecord(raw);
    if (typeof record.text !== 'string') return [];
    return [{ text: record.text, ...(typeof record.note === 'string' ? { note: record.note } : {}) }];
  });
}

function readTokens(value: unknown): DiffToken[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw) => {
    const record = asRecord(raw);
    const t = record.t;
    if ((t !== 'eq' && t !== 'extra' && t !== 'missing') || typeof record.w !== 'string') return [];
    return [{ t, w: record.w, typo: typeof record.typo === 'string' ? record.typo : null }];
  });
}

export function readTranslateSelfCheck(response: unknown): TranslateSelfCheck {
  const record = asRecord(response);
  const items: Record<string, TranslateSelfCheckItem> = {};
  for (const raw of Array.isArray(record.items) ? record.items : []) {
    const item = asRecord(raw);
    if (typeof item.itemId !== 'string') continue;
    const verdict = VERDICTS.includes(item.verdict as TranslateVerdict)
      ? (item.verdict as TranslateVerdict)
      : 'off';
    const tokens = readTokens(item.tokens);
    items[item.itemId] = {
      verdict,
      ...(tokens !== undefined ? { tokens } : {}),
      ...(typeof item.divergingWords === 'number' ? { divergingWords: item.divergingWords } : {}),
      missing: readGuards(item.missing),
      banned: readGuards(item.banned),
    };
  }
  return { checksLeft: Math.max(0, num(record.checksLeft)), passing: num(record.passing), items };
}

export interface CorrectionSelfCheckItem {
  fixedCount: number;
  spanCount: number;
  remainingTypes?: string[];
  strayEdits: number;
}

export interface CorrectionSelfCheck {
  checksLeft: number;
  fixedCount: number;
  spanCount: number;
  items: Record<string, CorrectionSelfCheckItem>;
}

export function readCorrectionSelfCheck(response: unknown): CorrectionSelfCheck {
  const record = asRecord(response);
  const items: Record<string, CorrectionSelfCheckItem> = {};
  for (const raw of Array.isArray(record.items) ? record.items : []) {
    const item = asRecord(raw);
    if (typeof item.itemId !== 'string') continue;
    items[item.itemId] = {
      fixedCount: num(item.fixedCount),
      spanCount: num(item.spanCount),
      ...(Array.isArray(item.remainingTypes)
        ? { remainingTypes: item.remainingTypes.filter((x): x is string => typeof x === 'string') }
        : {}),
      strayEdits: num(item.strayEdits),
    };
  }
  return {
    checksLeft: Math.max(0, num(record.checksLeft)),
    fixedCount: num(record.fixedCount),
    spanCount: num(record.spanCount),
    items,
  };
}
