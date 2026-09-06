/**
 * Pure mapping logic for `writing_task`.
 *
 * The wire shape changed with plan 50 (ssz-platform-web/docs/plan/50-writing-task.md).
 * `content` is no longer the stored document but a **projection** of it
 * (shared-kernel `writing-task/projection.ts`, applied by content-service's
 * `studentSafeContent` before `/exercises/:id/display` answers): the stored document
 * holds the answer key — the model answer, the point keywords and the rubric's level
 * descriptors — and only the descriptors are ever projected, and only when the author
 * set `showRubric: 'always'`, where they are a writing guide rather than a mark.
 *
 * The submission is `{ text, ticked }`. `text` stays exactly where it was: the review
 * queue reads the essay out of that field (`get-submission-for-review.handler.ts`), and
 * `ticked` is the learner's own checklist, carried along because it is theirs, not
 * because anything grades it.
 *
 * Nothing here decides an outcome. `writing_task` is never auto-scored — every
 * submission comes back `requiresReview: true` from
 * `writing-task.validator.ts` in exercise-engine (the old `FREE_FORM_CODES` set was
 * removed with plan 50 phase 2, together with its last member) and waits for a teacher.
 * The only judgement made on this side is whether the text is long enough to hand in.
 */

/** Which kind of writing this is; it decides what material the task shows. */
export type WritingTaskMode = 'letter' | 'essay' | 'picture' | 'retell' | 'free';

/** One must-cover point, as a checklist item. Its keywords stay on the server. */
export interface WritingTaskPoint {
  id: string;
  text: string;
  /** Optional points are shown but do not count towards a pass. */
  required: boolean;
}

/**
 * One rubric criterion with its four level descriptors. Present only when the author
 * chose `showRubric: 'always'` — otherwise the projection carries no rubric at all.
 */
export interface WritingTaskCriterion {
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  levels: [string, string, string, string];
}

/** `picture` mode only. `assetId` is resolved through media-service, not stored as a URL. */
export interface WritingTaskImage {
  assetId?: string;
  caption: string;
  alt: string;
}

/** `letter` mode only. */
export interface WritingTaskLetter {
  register: 'formal' | 'informal';
  recipient: string;
}

/**
 * The settings that change what the learner sees or may do.
 *
 * The AI stage's switches are deliberately absent — the projection does not send them
 * (plan 50 §3.5 leaves the stage unbuilt), and a runner that read them would grow the
 * button that goes with them.
 */
export interface WritingTaskSettings {
  minWords: number;
  maxWords: number;
  /** Minutes, 0 = no timer. */
  timer: number;
  blockPaste: boolean;
  autosave: boolean;
  showWordCount: boolean;
  showPlan: boolean;
  showPhrases: boolean;
  showRubric: 'always' | 'afterGraded' | 'never';
  showModel: 'afterGraded' | 'never';
  /** Rubric points needed to pass, out of `rubricMax`. Shown, not secret. */
  passScore: number;
  revision: 'return' | 'once' | 'drafts';
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface WritingTaskContent {
  mode: WritingTaskMode;
  instruction: string;
  prompt: string;
  /** `retell` only — the text being retold. */
  source?: string;
  /** `picture` only. */
  image?: WritingTaskImage;
  /** `letter` only. */
  letter?: WritingTaskLetter;
  points: WritingTaskPoint[];
  phrases: string[];
  /** Only when `showRubric: 'always'`. */
  rubric?: WritingTaskCriterion[];
  /** `Σ 3 × weight` over the whole rubric, whatever `showRubric` says. */
  rubricMax: number;
  settings: WritingTaskSettings;
}

export interface WritingTaskAnswer {
  text: string;
  /** Ids of the checklist points the learner ticked off. */
  ticked: string[];
}

/** Mirrors the kernel's `Settings` defaults — the values an author starts from. */
const DEFAULT_SETTINGS: WritingTaskSettings = {
  minWords: 120,
  maxWords: 200,
  timer: 0,
  blockPaste: true,
  autosave: true,
  showWordCount: true,
  showPlan: true,
  showPhrases: true,
  showRubric: 'afterGraded',
  showModel: 'afterGraded',
  passScore: 8,
  revision: 'return',
};

const MODES: WritingTaskMode[] = ['letter', 'essay', 'picture', 'retell', 'free'];

/**
 * Accept the task only if what arrived is the student projection.
 *
 * Unlike the gapped templates, a `writing_task` document renders perfectly well with its
 * answer key still attached — the prompt, the points and the material read the same
 * either way. That is what makes the check worth making: a runner handed the stored
 * document would look right while holding the model answer and the point keywords, which
 * is the one thing the handoff's security rule forbids. So the two fields that exist only
 * on the stored side are treated as proof that the server did not project — a point with
 * `keywords`, or a document with `model` — and the answer is to refuse, not to strip the
 * key here and hide the fact that it was sent.
 *
 * `null` also covers the exercises still seeded in the old shape (`options`/`min_words`):
 * they carry no `mode` and no `points`, and a body that guessed at them would put an
 * empty prompt on screen. Refusing says which exercise needs reseeding.
 *
 * Settings are filled from the defaults rather than refused: they arrange the screen,
 * they are not what it is about, and a task missing `showPhrases` is still a task worth
 * writing.
 */
export function readWritingTaskContent(value: unknown): WritingTaskContent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as Partial<WritingTaskContent> & { model?: unknown };
  if (typeof raw.prompt !== 'string' || raw.prompt.trim() === '') return null;
  if (!Array.isArray(raw.points)) return null;
  if (raw.model !== undefined) return null;
  if (raw.points.some(point => point !== null && typeof point === 'object' && 'keywords' in point))
    return null;
  if (raw.mode === undefined || !MODES.includes(raw.mode)) return null;

  return {
    ...raw,
    mode: raw.mode,
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    prompt: raw.prompt,
    points: raw.points.filter(
      (point): point is WritingTaskPoint =>
        typeof point === 'object' &&
        point !== null &&
        typeof (point as { id?: unknown }).id === 'string' &&
        typeof (point as { text?: unknown }).text === 'string',
    ),
    phrases: Array.isArray(raw.phrases)
      ? raw.phrases.filter((phrase): phrase is string => typeof phrase === 'string')
      : [],
    rubricMax:
      typeof raw.rubricMax === 'number' && raw.rubricMax > 0
        ? raw.rubricMax
        : (raw.rubric ?? []).reduce((sum, criterion) => sum + 3 * (criterion.weight ?? 1), 0),
    settings: readSettings(raw.settings),
  };
}

function readSettings(raw: Partial<WritingTaskSettings> | undefined): WritingTaskSettings {
  const s = raw ?? {};
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  return {
    minWords: num(s.minWords, DEFAULT_SETTINGS.minWords),
    maxWords: num(s.maxWords, DEFAULT_SETTINGS.maxWords),
    timer: num(s.timer, DEFAULT_SETTINGS.timer),
    blockPaste: bool(s.blockPaste, DEFAULT_SETTINGS.blockPaste),
    autosave: bool(s.autosave, DEFAULT_SETTINGS.autosave),
    showWordCount: bool(s.showWordCount, DEFAULT_SETTINGS.showWordCount),
    showPlan: bool(s.showPlan, DEFAULT_SETTINGS.showPlan),
    showPhrases: bool(s.showPhrases, DEFAULT_SETTINGS.showPhrases),
    showRubric: s.showRubric ?? DEFAULT_SETTINGS.showRubric,
    showModel: s.showModel ?? DEFAULT_SETTINGS.showModel,
    passScore: num(s.passScore, DEFAULT_SETTINGS.passScore),
    revision: s.revision ?? DEFAULT_SETTINGS.revision,
  };
}

const STRIP = /[«»"'.,;:!?()\-–—]/g;

/**
 * The kernel's tokeniser, character for character (`analysis.ts`): lowercase, strip
 * punctuation, collapse whitespace, split.
 *
 * Copied rather than approximated on purpose. This count is what lets the learner hand
 * the text in, and the same count taken again on the server is what the teacher reads in
 * the queue; a tokeniser that split on `/\s+/` here would let a text through at 120 words
 * that arrives as 118, and neither screen would be able to explain the other.
 */
export function words(text: string): string[] {
  const normalized = text.toLowerCase().replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  return normalized === '' ? [] : normalized.split(' ');
}

/** How the text stands against the author's range. */
export type TextLength = 'empty' | 'short' | 'long' | 'ok';

export function measure(
  settings: Pick<WritingTaskSettings, 'minWords' | 'maxWords'>,
  text: string,
): { words: number; length: TextLength } {
  const count = words(text).length;
  const length: TextLength =
    count === 0
      ? 'empty'
      : count < settings.minWords
        ? 'short'
        : settings.maxWords > 0 && count > settings.maxWords
          ? 'long'
          : 'ok';
  return { words: count, length };
}

/** Why the Check button is disabled, or `null` when nothing stands in the way. */
export type SubmitBlock = 'empty' | 'short' | 'long' | null;

export interface SubmitGate {
  canSubmit: boolean;
  block: SubmitBlock;
  /** Words still needed, for the `short` note. */
  remaining: number;
}

/**
 * Whether this text may be handed in, and what to say about it.
 *
 * Ticked checklist items are not consulted: they are the learner's own tracking, and a
 * task that refused a finished text because a box was unticked would be grading the
 * tracking instead of the writing.
 */
export function submitGate(
  settings: Pick<WritingTaskSettings, 'minWords' | 'maxWords'>,
  text: string,
): SubmitGate {
  const { words: count, length } = measure(settings, text);

  if (length === 'empty') return { canSubmit: false, block: 'empty', remaining: 0 };
  if (length === 'short') {
    return { canSubmit: false, block: 'short', remaining: settings.minWords - count };
  }
  if (length === 'long') return { canSubmit: false, block: 'long', remaining: 0 };
  return { canSubmit: true, block: null, remaining: 0 };
}

/**
 * The payload, or `null` while there is nothing to send.
 *
 * The text keeps its own line breaks — paragraphs are one of the things the teacher
 * counts — and is only trimmed at the ends.
 */
export function buildWritingTaskAnswer(text: string, ticked: string[]): WritingTaskAnswer | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return { text: trimmed, ticked: [...ticked] };
}

/** Ticks a checklist point on or off. Pure — never mutates the input. */
export function togglePoint(ticked: string[], id: string): string[] {
  return ticked.includes(id) ? ticked.filter(other => other !== id) : [...ticked, id];
}

/**
 * Drops a suggested phrase at the end of the text, with one space around it — the
 * learner keeps writing from there, so the caret never lands mid-word.
 */
export function appendPhrase(text: string, phrase: string): string {
  const base = text === '' ? '' : text.replace(/\s*$/, ' ');
  return `${base}${phrase} `;
}

/** `615` → `10:15`. Floors at zero: what happens there is undecided in the handoff. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
