/**
 * Pure mapping logic for `word_bank_gap_fill` — `@ssz/shared-kernel/wordbank-gapfill`'s student
 * projection as the display endpoint serves it.
 *
 * This template stores each sentence solved, so content-service cuts the answers out before
 * the content leaves the server: what arrives is a list of tokens per sentence, with each gap a
 * `gapKey` and the punctuation that surrounded the hidden word, plus a shuffled bank (`null` in
 * free-input mode). Nothing on the device can tell which word is right.
 *
 * Grading is the engine's (`word-bank-gap-fill.validator.ts`): the answer is a list of
 * placements, the verdict is right/wrong and an explanation per gap — never the word. A practice
 * attempt is reopened on the next check, so a learner may check as often as they like. The
 * words themselves come only from `/reveal`, which records that they were shown.
 */

export type GapKey = string;

export interface GapFillTextToken {
  kind: 'text';
  text: string;
}

export interface GapFillGapToken {
  kind: 'gap';
  gapKey: GapKey;
  label: string;
  /** Punctuation before the hidden word. */
  before: string;
  /** Punctuation after it. */
  after: string;
}

export type GapFillToken = GapFillTextToken | GapFillGapToken;

export interface GapFillSentence {
  id: string;
  tokens: GapFillToken[];
  hint?: string;
}

export interface GapFillTask {
  sentences: GapFillSentence[];
  /** `null` when the learner types every word. */
  bank: string[] | null;
  allowReuse: boolean;
  showBankCount: boolean;
  /** Every gap, in reading order. */
  gapKeys: GapKey[];
}

/** One gap as the engine judged it. */
export interface GapVerdict {
  correct: boolean;
  explanation: string | null;
}

/** One gap's answer, as `/reveal` hands it over. */
export interface RevealedGap {
  word: string;
  why: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

function readToken(raw: unknown): GapFillToken | null {
  const record = asRecord(raw);
  if (record.kind === 'gap') {
    const gapKey = asString(record.gapKey);
    if (gapKey === '') return null;
    return {
      kind: 'gap',
      gapKey,
      label: asString(record.label),
      before: asString(record.before),
      after: asString(record.after),
    };
  }
  if (record.kind === 'text') return { kind: 'text', text: asString(record.text) };
  return null;
}

export function readGapFillTask(content: unknown): GapFillTask {
  const record = asRecord(content);
  const sentences = (Array.isArray(record.sentences) ? record.sentences : []).map(
    (raw, index): GapFillSentence => {
      const sentence = asRecord(raw);
      const hint = asString(sentence.hint);
      return {
        id: asString(sentence.id) || `s${index + 1}`,
        tokens: (Array.isArray(sentence.tokens) ? sentence.tokens : [])
          .map(readToken)
          .filter((token): token is GapFillToken => token !== null),
        ...(hint !== '' ? { hint } : {}),
      };
    },
  );
  const settings = asRecord(record.settings);
  const bank = Array.isArray(record.bank)
    ? record.bank.filter((word): word is string => typeof word === 'string')
    : null;

  return {
    sentences,
    // A free-input exercise says so twice — no bank, and `input: 'free'`. Either is enough.
    bank: settings.input === 'free' ? null : bank,
    allowReuse: settings.allowReuse === true,
    showBankCount: settings.showBankCount !== false,
    gapKeys: sentences.flatMap((sentence) =>
      sentence.tokens.flatMap((token) => (token.kind === 'gap' ? [token.gapKey] : [])),
    ),
  };
}

/** What the engine reads: one placement per filled gap. */
export function buildGapFillAnswer(
  gapKeys: GapKey[],
  values: Record<GapKey, string>,
): { placements: { gapKey: GapKey; word: string }[] } {
  return {
    placements: gapKeys
      .map((gapKey) => ({ gapKey, word: (values[gapKey] ?? '').trim() }))
      .filter((placement) => placement.word !== ''),
  };
}

export function gapFillCanSubmit(gapKeys: GapKey[], values: Record<GapKey, string>): boolean {
  return gapKeys.length > 0 && gapKeys.every((gapKey) => (values[gapKey] ?? '').trim() !== '');
}

/**
 * Which bank chips are still free, by index — a bank may hold the same word twice, and each
 * copy is spent separately. With `allowReuse` nothing is ever spent.
 */
export function freeBankSlots(
  bank: string[],
  values: Record<GapKey, string>,
  allowReuse: boolean,
): boolean[] {
  if (allowReuse) return bank.map(() => true);
  const placed = new Map<string, number>();
  for (const word of Object.values(values)) {
    if (word !== '') placed.set(word, (placed.get(word) ?? 0) + 1);
  }
  return bank.map((word) => {
    const left = placed.get(word) ?? 0;
    if (left > 0) {
      placed.set(word, left - 1);
      return false;
    }
    return true;
  });
}

/** Per-gap verdicts out of a check's learner-facing details; empty when there are none. */
export function readGapVerdicts(details: unknown): Record<GapKey, GapVerdict> {
  const out: Record<GapKey, GapVerdict> = {};
  const gaps = asRecord(details).gaps;
  if (!Array.isArray(gaps)) return out;
  for (const raw of gaps) {
    const record = asRecord(raw);
    const gapKey = record.gapKey;
    if (typeof gapKey !== 'string' || typeof record.correct !== 'boolean') continue;
    out[gapKey] = {
      correct: record.correct,
      explanation: typeof record.explanation === 'string' ? record.explanation : null,
    };
  }
  return out;
}

/** The answers out of a `/reveal` response, by gap. */
export function readRevealedGaps(response: unknown): Record<GapKey, RevealedGap> {
  const out: Record<GapKey, RevealedGap> = {};
  const answers = asRecord(response).answers;
  if (!Array.isArray(answers)) return out;
  for (const raw of answers) {
    const record = asRecord(raw);
    const gapKey = record.gapKey;
    if (typeof gapKey !== 'string' || typeof record.word !== 'string') continue;
    out[gapKey] = { word: record.word, why: typeof record.why === 'string' ? record.why : null };
  }
  return out;
}
