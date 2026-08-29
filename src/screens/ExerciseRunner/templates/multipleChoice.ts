/**
 * Pure mapping logic for `multiple_choice` — a set of questions answered one at a time.
 *
 * The wire shape changed with plan 53 (ssz-platform-web/docs/plan/53-multiple-choice.md).
 * A `multiple_choice` document is now a *set*: `content.questions[]`, each with its own
 * stem, its own options and its own budget of tries. What arrives here is never the
 * stored document but a **projection** of it (shared-kernel `multiple-choice/
 * projection.ts`, applied by content-service's `studentSafeContent`): which option is
 * right, the rule behind it and every rebuttal stay on the server, in the other column.
 *
 * Nothing on this side grades, and nothing on this side could. That is sharper here than
 * it looks: the key is only an id, so leaking it would not teach anybody anything — but
 * the whole mechanism of the type is *dosing*. A second try and a 50/50 offered by a
 * device that already holds the key are decoration (plan 53 §3.2). So the pick goes up
 * with `POST /exercises/:id/attempts/:attemptId/answers` and the verdict comes back with
 * it; `keyOptionId` and the rule arrive only once the question is closed.
 *
 * The old single-question form is still live: plan 53 §8 Q2 reseeds the first lesson of
 * `norsk-b1` and leaves 121 exercises written as `content.question` +
 * `expectedAnswers.correct_option_ids` untouched. They are graded by the engine's
 * `multiple-choice-legacy.ts` and rendered by `MultipleChoiceLegacyBody`;
 * `isMultipleChoiceDocument` is what tells the two apart, on this side exactly as on the
 * server — by the shape of the document, never by a version field, since those 121 were
 * written before any version existed.
 */

/* ── The new form: the projected set ─────────────────────────────────────── */

/** What the question is about. It decides nothing here; the author's own label. */
export type MultipleChoiceKind = 'grammar' | 'vocab' | 'reading' | 'listening';

/** One option as the runner receives it — never a flag saying whether it is the key. */
export interface ProjectedOption {
  id: string;
  text: string;
}

/** One question as the runner receives it. */
export interface ProjectedQuestion {
  id: string;
  kind: MultipleChoiceKind;
  /** The sentence being asked about; `___` marks the gap where there is one. */
  stem: string;
  /** A passage above the stem. Never sent for `listening` — that text is the author's. */
  context?: string;
  options: ProjectedOption[];
}

/**
 * The settings that change what the student sees or may do.
 *
 * `shuffle` and `shuffleQuestions` are deliberately absent — they are already applied to
 * the order that arrived, and re-applying them here would shuffle something the network
 * has shown in order. So are `showWhyWrong` and `explainOnCorrect`: they decide what the
 * *server* puts in a verdict, and reading them here would invite this screen to act on
 * them twice.
 */
export interface MultipleChoiceSettings {
  letters: boolean;
  layout: 'list' | 'grid';
  /** The tap is the hand-in: there is no Check button under this. */
  instant: boolean;
  /** The attempt budget: `none` → 1 try, `one` → 2, `unlimited` → 99. */
  retry: 'none' | 'one' | 'unlimited';
  /** Whether a miss with a try left may take two wrong options off the screen. */
  eliminate: boolean;
  progress: boolean;
}

/** `ExerciseDisplay.content` for the new form, as the kernel's `StudentProjection`. */
export interface MultipleChoiceSet {
  instruction: string;
  questions: ProjectedQuestion[];
  settings: MultipleChoiceSettings;
}

/**
 * What comes back when a pick is handed in (`AnswerQuestionChoiceResultDto`).
 *
 * The optional fields are the contract, not politeness. `keyOptionId` and `why` arrive
 * **only once the question is closed** — right, revealed, or the budget spent — because
 * sending them beside a wrong pick with a try left would make that try into theatre
 * (plan 53 §6.1). Nothing here fills them in.
 */
export interface MultipleChoiceResult {
  questionId: string;
  /** The option that was judged. Empty string when the question was revealed, not picked. */
  optionId: string;
  correct: boolean;
  /** 1-based. Only a hit on try 1 scores. */
  attempt: number;
  attemptsLeft: number;
  /** No further pick is possible on this question. */
  closed: boolean;
  keyOptionId?: string;
  /** The rule behind the right answer. */
  why?: string;
  /** The rebuttal of the option that was picked. */
  optionWhy?: string;
  /** The 50/50: options to dim. Cumulative, and only on a miss with a try left. */
  eliminated?: string[];
}

/** One question of a set already picked at on an open attempt (`pickedOptions`). */
export interface ResumedPick {
  questionId: string;
  /** Every option tried, in order. Its length is which try the question reached. */
  picks: string[];
  eliminated: string[];
  correct: boolean;
  closed: boolean;
  revealed: boolean;
}

/** The `submittedAnswer` that closes the attempt. */
export interface MultipleChoiceSubmission {
  answers: Array<{ questionId: string; optionId: string; attempt: number }>;
}

/** Mirrors the kernel's `DEFAULT_SETTINGS` — the values an author starts from. */
const DEFAULT_SETTINGS: MultipleChoiceSettings = {
  letters: true,
  layout: 'list',
  instant: false,
  retry: 'one',
  eliminate: false,
  progress: true,
};

/** Badges A–H. Past the eighth option the position is shown instead. */
const LETTERS = 'ABCDEFGH';

export function optionLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

/**
 * Which form this document is written in — the kernel's own test (`persistence.ts`), word
 * for word: `questions` being an array and nothing else. An old document has no such
 * field; a new one always does, even while empty.
 */
export function isMultipleChoiceDocument(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  return Array.isArray((content as { questions?: unknown }).questions);
}

/**
 * Accept the set only if what arrived is the student projection.
 *
 * For this template the check is unusually sharp, because the content column was built
 * with nothing in it to withhold: which option is right is neither a flag on an option
 * nor its position, but a question id → option id map in the other column. So a `correct`
 * on an option, or a `why` on a question or an option, means the stored document itself
 * arrived — a content-service older than plan 53 phase 2, or a route that reached for the
 * authoring copy.
 *
 * The answer to that is to refuse, not to strip the key here. Stripping would leave a
 * runner that works, an exercise whose retry and 50/50 are decoration, and nothing on any
 * screen to say the key was ever sent (plan 50's finding; plan 53 §6.3 repeats it).
 *
 * Refusing is not what happens to the 121 old exercises: they have no `questions` at all
 * and never reach this function — `isMultipleChoiceDocument` sends them to the legacy
 * body first.
 */
export function readMultipleChoiceSet(value: unknown): MultipleChoiceSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as { instruction?: unknown; questions?: unknown; settings?: unknown };
  if (!Array.isArray(raw.questions)) return null;

  const questions: ProjectedQuestion[] = [];

  for (const item of raw.questions) {
    if (typeof item !== 'object' || item === null) return null;
    const q = item as Record<string, unknown>;

    if ('why' in q) return null;

    const id = q.id;
    const stem = q.stem;
    const options = q.options;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof stem !== 'string' || stem.trim() === '') return null;
    if (!Array.isArray(options)) return null;

    const read: ProjectedOption[] = [];
    for (const entry of options) {
      if (typeof entry !== 'object' || entry === null) return null;
      const o = entry as Record<string, unknown>;
      if ('correct' in o || 'why' in o) return null;

      const optionId = o.id;
      const text = o.text;
      if (typeof optionId !== 'string' || optionId === '') return null;
      if (typeof text !== 'string' || text.trim() === '') return null;
      read.push({ id: optionId, text });
    }

    // Fewer than two options is not a leak but an unanswerable question, and the
    // projection already drops those. One arriving here means the two sides disagree
    // about what is deliverable, which is worth refusing rather than rendering.
    if (read.length < 2) return null;

    const kind = q.kind;
    const context = q.context;

    questions.push({
      id,
      kind:
        kind === 'vocab' || kind === 'reading' || kind === 'listening' || kind === 'grammar'
          ? kind
          : 'grammar',
      stem,
      // Sent only where the author's passage is the student's to read — a `listening`
      // transcript is the author's own, and the server decides that, not this reader.
      ...(typeof context === 'string' && context.trim() !== '' ? { context } : {}),
      options: read,
    });
  }

  return {
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    questions,
    settings: readSettings(raw.settings),
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
function readSettings(raw: unknown): MultipleChoiceSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  const retry = s.retry;
  const layout = s.layout;

  return {
    letters: bool(s.letters, DEFAULT_SETTINGS.letters),
    layout: layout === 'grid' ? 'grid' : 'list',
    instant: bool(s.instant, DEFAULT_SETTINGS.instant),
    retry:
      retry === 'none' || retry === 'one' || retry === 'unlimited' ? retry : DEFAULT_SETTINGS.retry,
    eliminate: bool(s.eliminate, DEFAULT_SETTINGS.eliminate),
    progress: bool(s.progress, DEFAULT_SETTINGS.progress),
  };
}

/**
 * Read the server's verdict for one pick.
 *
 * Defensive in the same direction as the projection reader: a verdict without the fields
 * that say how the question now stands is no verdict, and guessing `closed` either way
 * would either strand the learner on a finished question or offer a try the engine will
 * refuse. The optional fields are copied only when they are there — a `keyOptionId` that
 * did not arrive is a question that is not over, and nothing here may stand in for it.
 */
export function readMultipleChoiceResult(value: unknown): MultipleChoiceResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const questionId = raw.questionId;
  const optionId = raw.optionId;
  if (typeof questionId !== 'string' || questionId === '') return null;
  if (typeof optionId !== 'string') return null;
  if (typeof raw.correct !== 'boolean' || typeof raw.closed !== 'boolean') return null;

  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;

  const keyOptionId = str(raw.keyOptionId);
  const why = str(raw.why);
  const optionWhy = str(raw.optionWhy);
  const eliminated = Array.isArray(raw.eliminated)
    ? raw.eliminated.filter((id): id is string => typeof id === 'string')
    : undefined;

  return {
    questionId,
    optionId,
    correct: raw.correct,
    attempt: Math.max(1, num(raw.attempt, 1)),
    attemptsLeft: Math.max(0, num(raw.attemptsLeft, 0)),
    closed: raw.closed,
    ...(keyOptionId === undefined ? {} : { keyOptionId }),
    ...(why === undefined ? {} : { why }),
    ...(optionWhy === undefined ? {} : { optionWhy }),
    ...(eliminated === undefined ? {} : { eliminated }),
  };
}

/** Where a set picks up again, computed from what the engine says is on the attempt. */
export interface MultipleChoiceResume {
  /** The first question with nothing final on it, or the last one when all are closed. */
  index: number;
  /** Which try that question has reached, 1-based. */
  attempt: number;
  /** What a 50/50 has already taken away there. */
  eliminated: string[];
  /** Questions taken on the first pick — the score, recounted rather than carried. */
  score: number;
  /** Every question is finished and only the closing submit is left. */
  allClosed: boolean;
}

/**
 * Pick a set up where it was left (plan 53 §7, phase 4 finding 6).
 *
 * A pick is final the moment the budget is spent, and the attempt stays open until the
 * set is closed, so an app killed mid-set leaves questions the engine considers finished.
 * Walking from the top would mean picking again on a question it refuses — and, worse,
 * handing out a fresh first try at every question, which is the cheapest possible full
 * score.
 *
 * The pick itself is not restored: it was judged and the judgement is gone, so the
 * question reopens on the try it had reached, with the options the 50/50 had taken away.
 * Questions the set no longer holds are dropped — a document can be edited between
 * sittings.
 */
export function resumeMultipleChoice(
  set: MultipleChoiceSet,
  picks: ResumedPick[],
): MultipleChoiceResume {
  const known = picks.filter(p => set.questions.some(q => q.id === p.questionId));
  const score = known.filter(p => p.correct && p.picks.length === 1).length;

  const closed = new Set(known.filter(p => p.closed).map(p => p.questionId));
  const next = set.questions.findIndex(q => !closed.has(q.id));

  if (next === -1) {
    return {
      index: Math.max(0, set.questions.length - 1),
      attempt: 1,
      eliminated: [],
      score,
      allClosed: known.length > 0,
    };
  }

  const open = known.find(p => p.questionId === set.questions[next].id);
  return {
    index: next,
    attempt: Math.max(1, (open?.picks.length ?? 0) + 1),
    eliminated: open?.eliminated ?? [],
    score,
    allClosed: false,
  };
}

/**
 * The aggregate that closes the attempt.
 *
 * It is empty, and that is the honest shape of the request rather than a shortcut: the
 * engine throws away whatever arrives and rebuilds the list from the picks it recorded
 * through `answers`, because **which try a question was taken on is the score** — a
 * client sending its own attempt numbers would be marking itself (plan 53 §5).
 */
export function buildMultipleChoiceSubmission(): MultipleChoiceSubmission {
  return { answers: [] };
}

/* ── The old form: one question, one submission ──────────────────────────── */

/**
 * `content` of an exercise still written in the pre-plan-53 shape. Kept working, not kept
 * fresh: these are answered by submitting `{ correct_option_ids: [id] }` and graded by
 * the engine's `multiple-choice-legacy.ts` exactly as they were before.
 */
export interface McqOption {
  id: string;
  text: string;
}

export interface McqContent {
  question: string;
  options: McqOption[];
  context?: string;
  media_id?: string;
}

/**
 * Both `submittedAnswer` and `expectedAnswers`/`correctAnswer` share this shape. It's an
 * array to support single- AND multi-select variants — a single-answer exercise just has
 * exactly one element (per the answerSchema's own comment).
 */
export interface McqAnswer {
  correct_option_ids: string[];
}

export function buildMcqAnswer(selectedId: string | null): McqAnswer | null {
  return selectedId ? { correct_option_ids: [selectedId] } : null;
}

export function mcqCanSubmit(selectedId: string | null): boolean {
  return selectedId !== null;
}

/** Reads the option ids out of an opaque `feedback.correctAnswer` value. */
export function extractCorrectOptionIds(correctAnswer: unknown): string[] | null {
  if (
    correctAnswer &&
    typeof correctAnswer === 'object' &&
    Array.isArray((correctAnswer as { correct_option_ids?: unknown }).correct_option_ids)
  ) {
    return (correctAnswer as McqAnswer).correct_option_ids;
  }
  return null;
}
