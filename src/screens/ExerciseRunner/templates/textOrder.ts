/**
 * Pure logic for `text_order` — put the lines of a text or a dialogue back in order.
 *
 * The display document carries the lines in the author's order, which *is* the answer, so the
 * runner deals them out shuffled. The shuffle is the web runner's `shuffleOrder`, ported as is
 * and seeded by the exercise id: the same exercise poses the same puzzle on the phone and on
 * the web, and a reload does not reshuffle it. It never returns the original order.
 *
 * The engine (`text-order.validator.ts`) compares the submitted ids position by position. Its
 * per-position details are not forwarded to the learner — only `correct` and a score — and the
 * score is the share of lines in their own place, which is how the result line is drawn.
 */

export interface OrderLine {
  id: string;
  text: string;
  speaker?: string;
}

export interface TextOrderTask {
  kind: 'sentences' | 'dialogue';
  /** Where the lines come from, shown above them. */
  context: string;
  lines: OrderLine[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export function readTextOrderTask(content: unknown): TextOrderTask {
  const record = asRecord(content);
  const lines = (Array.isArray(record.items) ? record.items : [])
    .map((raw): OrderLine | null => {
      const item = asRecord(raw);
      const id = asString(item.id);
      if (id === '') return null;
      const speaker = asString(item.speaker);
      return { id, text: asString(item.text), ...(speaker !== '' ? { speaker } : {}) };
    })
    .filter((line): line is OrderLine => line !== null);
  return {
    kind: record.kind === 'dialogue' ? 'dialogue' : 'sentences',
    context: asString(record.context) || asString(record.instruction),
    lines,
  };
}

/**
 * Deterministic shuffle from an item list — the web runner's, line for line, so both clients
 * pose the same puzzle for the same seed. Never returns the expected order for two or more.
 */
export function shuffleOrder(ids: string[], seed: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };

  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  // Landing on the original order would hand over the answer; rotating keeps it deterministic.
  if (out.length > 1 && out.every((id, i) => id === ids[i])) {
    out.push(out.shift()!);
  }
  return out;
}

/** Move the line at `from` to `to`, shifting the rest. Out-of-range moves change nothing. */
export function moveLine(order: string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) {
    return order;
  }
  const next = [...order];
  const [line] = next.splice(from, 1);
  next.splice(to, 0, line!);
  return next;
}

export function buildTextOrderAnswer(order: string[]): { order: string[] } {
  return { order: [...order] };
}

/**
 * Lines in their own place, from the engine's score — `round(100 × placed / total)`, which is
 * exact to recover for any set this template can hold. Null when there is no score to read.
 */
export function placedFromScore(score: number | null | undefined, total: number): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || total <= 0) return null;
  return Math.max(0, Math.min(total, Math.round((score * total) / 100)));
}
