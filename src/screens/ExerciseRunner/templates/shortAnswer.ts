/**
 * Pure mapping logic for `short_answer` — a set of open comprehension questions.
 *
 * The wire shape changed with plan 51 (ssz-platform-web/docs/plan/51-short-answer.md).
 * A `short_answer` document is now a *set*: `content.questions[]`, each with its own
 * prompt and (for `reading`) its own passage, answered one question at a time. What
 * arrives here is never the stored document but a **projection** of it (shared-kernel
 * `short-answer/projection.ts`, applied by content-service's `studentSafeContent`): the
 * key — the semantic elements with their anchor phrases, the model answer, the
 * explanation — stays on the server, because for this template the anchors are literally
 * the answer written in the words the student is being asked to find (plan 51 §3.2).
 *
 * Nothing on this side grades, and nothing on this side could: the phrases an answer is
 * matched against never reach the device. Each answer is handed in with
 * `POST /exercises/:id/attempts/:attemptId/answers` and the verdict comes back with it
 * (`StudentResult`); the last one closes the attempt with the ordinary `submit`, sending
 * every answer in one aggregate, which the engine regrades from scratch — a verdict that
 * reached a client is a verdict a client could send back (plan 51 §3.3).
 *
 * The old single-question form is still live: plan 51 §8 Q1 leaves 144 exercises written
 * as `content.question` + `expectedAnswers.accepted_answers` untouched until the
 * catalogue is rewritten. They are graded by the engine's `short-answer-legacy.ts` and
 * rendered by the legacy half of `ShortAnswerBody`; `isShortAnswerDocument` is what tells
 * the two apart, on this side exactly as on the server — by the shape of the document,
 * never by a version field, since those 144 were written before any version existed.
 */

/* ── The new form: the projected set ─────────────────────────────────────── */

/** What the question is asked about — it decides whether a passage comes with it. */
export type ShortAnswerKind = 'reading' | 'listening' | 'opinion';

export type ShortAnswerVerdict = 'pass' | 'partial' | 'fail';

/** One question as the runner receives it — never the key that judges it. */
export interface ShortAnswerQuestion {
  id: string;
  kind: ShortAnswerKind;
  prompt: string;
  /** `reading` only. A `listening` transcript is the author's, not the student's. */
  passage?: string;
  /** Only under `showModel: 'always'`. Otherwise it arrives with the verdict, or never. */
  model?: string;
}

/**
 * The settings that change what the student sees or may do.
 *
 * The grading settings (`typos`, `caseless`) are deliberately absent — the projection
 * does not send them, because the client does not grade. `passRule` / `passN` /
 * `minWords` are sent and kept: they label what the server's result says, and knowing
 * that two elements are needed tells nobody what they are.
 */
export interface ShortAnswerSettings {
  passRule: 'all' | 'n';
  passN: number;
  minWords: number;
  showBreakdown: boolean;
  showModel: 'always' | 'onClose' | 'never';
  aiStage: boolean;
  aiGrammar: boolean;
  /** Who sees the answer after it is handed in — the routing line reads this. */
  teacherReview: 'all' | 'flagged' | 'none';
  progress: boolean;
}

/** `ExerciseDisplay.content` for the new form, as the kernel's `StudentProjection`. */
export interface ShortAnswerSet {
  instruction: string;
  questions: ShortAnswerQuestion[];
  settings: ShortAnswerSettings;
}

/** One element in the breakdown: the teacher's label and whether the answer said it. */
export interface ShortAnswerHit {
  id: string;
  label: string;
  required: boolean;
  hit: boolean;
}

/**
 * What comes back when a question is handed in — the server's verdict and everything the
 * student is allowed to see behind it (kernel `toStudentResult`).
 *
 * The anchor that matched is not in here: it is dropped on the server, not hidden by the
 * component, so a breakdown could not leak the key one question at a time even if it
 * tried.
 */
export interface ShortAnswerResult {
  questionId: string;
  verdict: ShortAnswerVerdict;
  covered: number;
  total: number;
  tooShort: boolean;
  /** Empty when the author switched the breakdown off — no rows are sent at all. */
  hits: ShortAnswerHit[];
  /** The teacher's explanation. Always shown once the answer is in. */
  why: string;
  /** Present under `showModel: 'always' | 'onClose'`; absent under `'never'`. */
  model?: string;
}

/** One answer as it goes up, and as the closing aggregate carries it. */
export interface ShortAnswerAnswer {
  questionId: string;
  text: string;
}

/** The `submittedAnswer` that closes the attempt. */
export interface ShortAnswerSubmission {
  answers: ShortAnswerAnswer[];
}

/** Mirrors the kernel's `DEFAULT_SETTINGS` — the values an author starts from. */
const DEFAULT_SETTINGS: ShortAnswerSettings = {
  passRule: 'all',
  passN: 2,
  minWords: 3,
  showBreakdown: true,
  showModel: 'onClose',
  aiStage: false,
  aiGrammar: true,
  teacherReview: 'flagged',
  progress: true,
};

/**
 * Which form this document is written in — the kernel's own test (`persistence.ts`), word
 * for word: `questions` being an array and nothing else. An old document has no such
 * field; a new one always does, even while empty.
 */
export function isShortAnswerDocument(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  return Array.isArray((content as { questions?: unknown }).questions);
}

/**
 * Accept the set only if what arrived is the student projection.
 *
 * The stored document and the projection look almost alike — both are a list of
 * questions with an `id`, a `kind`, a `passage` and a `prompt` — because for this
 * template the key lives in its own column. So the tells are the key's own fields: a
 * question carrying `elements` is the answer in the words the student is being asked to
 * find, a question carrying `why` is the explanation that belongs under a verdict, and a
 * `model` arriving while `showModel` is not `always` is the author's answer arriving
 * before it was earned. Any of them means an `exercise-engine` older than plan 51 phase 2.
 *
 * The answer to that is to refuse, not to strip the key here. Stripping would leave a
 * runner that works, an exercise that is pointless, and nothing on any screen to say the
 * key was ever sent (plan 50's finding, repeated by plan 51 §7 phase 4).
 *
 * Refusing is not what happens to the 144 old exercises: they have no `questions` at all
 * and never reach this function — `isShortAnswerDocument` sends them to the legacy body
 * first.
 */
export function readShortAnswerSet(value: unknown): ShortAnswerSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as { instruction?: unknown; questions?: unknown; settings?: unknown };
  if (!Array.isArray(raw.questions)) return null;

  const settings = readSettings(raw.settings);
  const questions: ShortAnswerQuestion[] = [];

  for (const item of raw.questions) {
    if (typeof item !== 'object' || item === null) return null;
    const q = item as Record<string, unknown>;

    if ('elements' in q || 'why' in q) return null;
    if ('model' in q && settings.showModel !== 'always') return null;

    const id = q.id;
    const prompt = q.prompt;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof prompt !== 'string' || prompt.trim() === '') return null;

    const kind = q.kind;
    const passage = q.passage;
    const model = q.model;

    questions.push({
      id,
      kind: kind === 'listening' || kind === 'opinion' ? kind : 'reading',
      prompt,
      // Present only for `reading` — the server decides that, and a passage that arrives
      // for another kind is shown as sent rather than second-guessed here.
      ...(typeof passage === 'string' && passage.trim() !== '' ? { passage } : {}),
      ...(typeof model === 'string' && model.trim() !== '' ? { model } : {}),
    });
  }

  return {
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    questions,
    settings,
  };
}

/**
 * The settings the runner arranges itself by, each falling back to the author's own
 * default rather than to a guess.
 *
 * Listed field by field rather than spread: the kernel's `Settings` also holds `typos`
 * and `caseless`, which the projection deliberately does not send. Spreading whatever
 * arrived would quietly re-admit them and make this screen look like it grades.
 */
function readSettings(raw: unknown): ShortAnswerSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  const showModel = s.showModel;
  const teacherReview = s.teacherReview;

  return {
    passRule: s.passRule === 'n' ? 'n' : 'all',
    passN: num(s.passN, DEFAULT_SETTINGS.passN),
    minWords: num(s.minWords, DEFAULT_SETTINGS.minWords),
    showBreakdown: bool(s.showBreakdown, DEFAULT_SETTINGS.showBreakdown),
    showModel:
      showModel === 'always' || showModel === 'never' || showModel === 'onClose'
        ? showModel
        : DEFAULT_SETTINGS.showModel,
    aiStage: bool(s.aiStage, DEFAULT_SETTINGS.aiStage),
    aiGrammar: bool(s.aiGrammar, DEFAULT_SETTINGS.aiGrammar),
    teacherReview:
      teacherReview === 'all' || teacherReview === 'none' || teacherReview === 'flagged'
        ? teacherReview
        : DEFAULT_SETTINGS.teacherReview,
    progress: bool(s.progress, DEFAULT_SETTINGS.progress),
  };
}

/**
 * Read the server's verdict for one question.
 *
 * Defensive in the same direction as the projection reader: a result without a verdict is
 * no result, and a coverage line built from missing numbers would read `0 av 0 punkter`
 * over a perfectly good answer. `hits` is filtered rather than refused — the author may
 * have switched the breakdown off, and an empty list is what that looks like.
 */
export function readShortAnswerResult(value: unknown): ShortAnswerResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const verdict = raw.verdict;
  if (verdict !== 'pass' && verdict !== 'partial' && verdict !== 'fail') return null;

  const questionId = raw.questionId;
  if (typeof questionId !== 'string' || questionId === '') return null;

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const hits = Array.isArray(raw.hits) ? raw.hits : [];
  const model = raw.model;

  return {
    questionId,
    verdict,
    covered: num(raw.covered),
    total: num(raw.total),
    tooShort: raw.tooShort === true,
    hits: hits.filter(isHit),
    why: typeof raw.why === 'string' ? raw.why : '',
    ...(typeof model === 'string' && model.trim() !== '' ? { model } : {}),
  };
}

function isHit(value: unknown): value is ShortAnswerHit {
  if (typeof value !== 'object' || value === null) return false;
  const h = value as Record<string, unknown>;
  return typeof h.id === 'string' && typeof h.label === 'string';
}

/** How the set came out, counted as the answers were handed in. */
export interface ShortAnswerTally {
  pass: number;
  partial: number;
  fail: number;
}

export const EMPTY_TALLY: ShortAnswerTally = { pass: 0, partial: 0, fail: 0 };

export function countVerdict(tally: ShortAnswerTally, verdict: ShortAnswerVerdict): ShortAnswerTally {
  return { ...tally, [verdict]: tally[verdict] + 1 };
}

/** Whether this text may be handed in. The field's own rule: it must not be empty. */
export function canHandIn(text: string): boolean {
  return text.trim() !== '';
}

/**
 * The aggregate that closes the attempt.
 *
 * The verdicts collected along the way are not sent: the validator recomputes all of them
 * from the text and the current key, which is what makes the score, the routing and the
 * teacher's breakdown independent of anything this device decided.
 */
export function buildShortAnswerSubmission(answers: ShortAnswerAnswer[]): ShortAnswerSubmission {
  return { answers: answers.map(({ questionId, text }) => ({ questionId, text })) };
}

/* ── The old form: one question, one submission ──────────────────────────── */

/**
 * `content` of an exercise still written in the pre-plan-51 shape. Kept working, not kept
 * fresh: these are answered by submitting `{ text }` and graded by the engine's
 * `short-answer-legacy.ts` exactly as they were before.
 */
export interface ShortAnswerLegacyContent {
  question: string;
  context?: string;
  media_id?: string;
  /** Soft length guidance for the UI (characters), not enforced client-side. */
  max_length?: number;
}

export interface ShortAnswerLegacyAnswer {
  text: string;
}

export function buildShortAnswerAnswer(text: string): ShortAnswerLegacyAnswer | null {
  const trimmed = text.trim();
  return trimmed ? { text: trimmed } : null;
}

export function shortAnswerCanSubmit(text: string): boolean {
  return text.trim() !== '';
}

/** Reads a human-readable model answer out of an opaque `feedback.correctAnswer`. */
export function extractReferenceAnswer(correctAnswer: unknown): string | null {
  if (
    correctAnswer &&
    typeof correctAnswer === 'object' &&
    typeof (correctAnswer as { reference_answer?: unknown }).reference_answer === 'string'
  ) {
    return (correctAnswer as { reference_answer: string }).reference_answer;
  }
  return null;
}
