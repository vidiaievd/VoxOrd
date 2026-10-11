/**
 * Pure mapping logic shared by `translate_to_target` and `translate_from_target` — the plan 42
 * document, read the way `@ssz/shared-kernel/translate` reads it.
 *
 * The display endpoint hands the phone the stored `content` column, not the kernel's student
 * projection, so the few things the projection resolves are resolved here instead: which
 * sentences run (`single` shows only the first written one — `runItems`), each sentence's
 * direction in a mixed set (`itemDirection`), and the language labels it is read and written
 * in. The accepted translations live in `expected_answers` and never reach the device.
 *
 * The engine grades it (`translate.validator.ts`): a hit on a variant of the key closes a
 * sentence, anything else goes to a teacher. So a submission is either `correct` as a whole
 * or `requiresReview` — never plainly wrong — and the only per-sentence outcome the learner is
 * shown is that routing (`learnerFacingDetails` strips the rest, which carries the key).
 */

export type TranslateDirection = 'to_target' | 'from_target';

export interface TranslateGloss {
  /** The word in the sentence. */
  w: string;
  /** What the author says about it. */
  t: string;
}

/** One sentence, resolved for the runner. */
export interface TranslateItem {
  id: string;
  dir: TranslateDirection;
  source: string;
  /** The language `source` is in, as the author labelled it. */
  sourceLang: string;
  /** The language the answer is written in. */
  answerLang: string;
  hint?: string;
  gloss: TranslateGloss[];
  /** A recording of `source`. */
  mediaId?: string;
}

export interface TranslateTask {
  /** `both` is a mixed set: each sentence keeps its own direction. */
  dir: TranslateDirection | 'both';
  /** Context for the learner, shown while answering. */
  note: string;
  langs: { explain: string; target: string };
  items: TranslateItem[];
  /** Offer æ ø å under answers written in the target language. */
  keyboard: boolean;
  /** Show the author's word notes. */
  gloss: boolean;
}

/** Where a sentence ended up after hand-in. */
export type TranslateRouting = 'pass' | 'teacher';

// The kernel's own defaults (`persistence.ts`), so an unlabelled document reads the same.
const DEFAULT_LANGS = { explain: 'Russisk', target: 'Norsk' };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

function readGloss(value: unknown): TranslateGloss[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const record = asRecord(raw);
      return { w: asString(record.w), t: asString(record.t) };
    })
    .filter((entry) => entry.w !== '' || entry.t !== '');
}

/**
 * Read a stored translate document. `templateCode` is only the fallback for a document with
 * no `dir`: a mixed set is stored under `translate_to_target`, so `content.dir` wins.
 */
export function readTranslateTask(content: unknown, templateCode: string): TranslateTask {
  const record = asRecord(content);
  const rawDir = record.dir;
  const dir: TranslateTask['dir'] =
    rawDir === 'to_target' || rawDir === 'from_target' || rawDir === 'both'
      ? rawDir
      : templateCode === 'translate_from_target'
        ? 'from_target'
        : 'to_target';

  const langsRecord = asRecord(record.langs);
  const langs = {
    explain: asString(langsRecord.explain) || DEFAULT_LANGS.explain,
    target: asString(langsRecord.target) || DEFAULT_LANGS.target,
  };

  const flow = asRecord(record.flow);
  const written = (Array.isArray(record.items) ? record.items : [])
    .map(asRecord)
    .filter((item) => asString(item.source).trim() !== '');
  const run = record.format === 'single' ? written.slice(0, 1) : written;

  const items = run.map((item, index): TranslateItem => {
    const itemDir: TranslateDirection =
      dir === 'both' ? (item.dir === 'from_target' ? 'from_target' : 'to_target') : dir;
    const hint = asString(item.hint);
    const mediaId = asString(item.mediaId);
    return {
      id: asString(item.id) || `s${index + 1}`,
      dir: itemDir,
      source: asString(item.source),
      sourceLang: itemDir === 'from_target' ? langs.target : langs.explain,
      answerLang: itemDir === 'from_target' ? langs.explain : langs.target,
      ...(hint !== '' ? { hint } : {}),
      gloss: readGloss(item.gloss),
      ...(mediaId !== '' ? { mediaId } : {}),
    };
  });

  return {
    dir,
    note: asString(record.note),
    langs,
    items,
    keyboard: flow.keyboard !== false,
    gloss: flow.gloss !== false,
  };
}

/** One entry per sentence, in order — the list `readSubmission` reads on the server. */
export function buildTranslateAnswer(
  items: TranslateItem[],
  values: Record<string, string>,
): { itemId: string; text: string }[] {
  return items.map((item) => ({ itemId: item.id, text: (values[item.id] ?? '').trim() }));
}

/** Every sentence written — the engine grades an empty one as a miss, so it is not offered. */
export function translateCanSubmit(items: TranslateItem[], values: Record<string, string>): boolean {
  return items.length > 0 && items.every((item) => (values[item.id] ?? '').trim() !== '');
}

/** Per-sentence routing out of the learner-facing details; empty when there are none. */
export function readTranslateRouting(details: unknown): Record<string, TranslateRouting> {
  const out: Record<string, TranslateRouting> = {};
  const items = asRecord(details).items;
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    const record = asRecord(raw);
    const itemId = record.itemId;
    const routing = record.routing;
    if (typeof itemId === 'string' && (routing === 'pass' || routing === 'teacher')) {
      out[itemId] = routing;
    }
  }
  return out;
}
