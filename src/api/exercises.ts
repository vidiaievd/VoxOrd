import { ApiError, apiClient } from './client';
import { isServerOutOfReach } from './isNetworkError';
import type {
  DifficultyLevel,
  ExerciseDisplay,
  ExerciseInstruction,
  ExerciseTemplateCode,
} from './types';

/* ─────────────────────────────────────────────────────────────────────────
 * Exercise display + server-side attempt flow.
 *
 * ARCHITECTURE NOTE — where grading happens.
 * The platform web runner currently grades answers *client-side*: it fetches
 * `GET /exercises/:id/answers` (the answer key) and runs local `grade*()`
 * helpers; its server-graded attempt path is @deprecated/dead. VoxOrd
 * deliberately does NOT follow that — the integration plan mandates
 * server-side validation only ("the mobile app never contains answer-checking
 * logic for platform exercises"). So mobile:
 *   - fetches display content WITHOUT the answer key (`/display`, not
 *     `/answers`), and
 *   - grades every answer through the exercise-engine attempts endpoint.
 * We mirror the web only for the state-machine shape and the per-template
 * `content` structure, not for its grading mechanism.
 *
 * Contract confirmed 2026-07-24 by reading:
 *   - content-service exercise.controller.ts (`GET :id/display`,
 *     ExerciseResponseDto)
 *   - exercise-engine-service attempts.controller.ts (start / submit),
 *     start-attempt.dto.ts, submit-answer.dto.ts, submit-answer.handler.ts
 *   - infrastructure/nginx/nginx.dev.conf (regex location
 *     `^/api/v1/exercises/[^/]+/attempts` → exercise-engine, declared before
 *     the content-service `/api/v1/exercises` prefix block — do not reorder).
 * ────────────────────────────────────────────────────────────────────── */

const EXERCISE_DISPLAY_PATH = (id: string) => `/api/v1/exercises/${id}/display`;
const EXERCISE_ANSWERS_PATH = (id: string) => `/api/v1/exercises/${id}/answers`;
const ATTEMPTS_PATH = (exerciseId: string) => `/api/v1/exercises/${exerciseId}/attempts`;
const SUBMIT_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/submit`;
const ANSWERS_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/answers`;
const ITEMS_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/items`;
const ROWS_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/rows`;
const SELF_CHECK_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/self-check`;
const REVEAL_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/reveal`;
const ATTEMPT_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}`;
const DRAFT_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/draft`;

/**
 * `GET /exercises/:id/display` (content-service). Returns the exercise
 * content WITHOUT `expectedAnswers` (a separate `/answers` endpoint carries
 * those, and mobile intentionally never calls it — see the note above). The
 * `content` shape is opaque here and cast per `templateCode` by the body
 * component that renders it (Phase 4.2+), mirroring how the web reader casts
 * `display.content` rather than using a shared discriminated union.
 *
 * `lang` selects the preferred instruction language (optional query param).
 */
export function getExerciseDisplay(id: string, lang?: string): Promise<ExerciseDisplay> {
  return apiClient.get<ExerciseDisplay>(EXERCISE_DISPLAY_PATH(id), {
    query: lang ? { lang } : undefined,
  });
}

/** `checkMode` for an attempt. PRACTICE reveals the correct answer in
 * feedback; GRADED withholds it. The self-study runner uses PRACTICE. */
export type AttemptCheckMode = 'PRACTICE' | 'GRADED';

/** Body for `POST /exercises/:exerciseId/attempts` (StartAttemptRequestDto). */
export interface StartAttemptRequest {
  /** Target-language code used to resolve instructions, e.g. "no". Required. */
  language: string;
  /** Defaults server-side to GRADED when an assignmentId is present, else PRACTICE. */
  mode?: AttemptCheckMode;
  assignmentId?: string;
  enrollmentId?: string;
  /**
   * The attempt already in progress that this start should hand back instead of refusing with
   * 409 — the id the 409 itself named. `read_aloud` joins its own open attempt this way: the
   * takes on its draft are assets of that attempt, and a new one would make every one of them
   * someone else's (plan 70, Q2-A).
   */
  joinAttemptId?: string;
  /**
   * `minimal_pairs` in PRACTICE: a sitting dealt and played on the phone offline, handed over
   * on the replay (offline plan, B6). The server keeps it if the document could have dealt it.
   */
  probeDraw?: unknown[];
}

/**
 * Response of `POST /exercises/:exerciseId/attempts` (StartAttemptResponseDto).
 * `exerciseContent` duplicates `/display`'s content, and `answerSchema` /
 * `checkSettings` describe server-side validation. `expectedAnswers` is null
 * in GRADED mode; mobile never relies on it (grading is server-side).
 */
export interface StartAttemptResponse {
  attemptId: string;
  templateCode: ExerciseTemplateCode;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  checkMode: AttemptCheckMode;
  exerciseContent: Record<string, unknown>;
  expectedAnswers: unknown;
  answerSchema: unknown;
  checkSettings: Record<string, unknown>;
}

/** Body for `POST /exercises/:exerciseId/attempts/:attemptId/submit`. */
export interface SubmitAttemptRequest {
  /**
   * Opaque, template-specific answer payload. Produced verbatim by the body
   * component and validated server-side against the attempt's `answerSchema`
   * — the client never inspects or checks it.
   */
  submittedAnswer: unknown;
  /** Seconds spent on this item, added to the attempt's cumulative time. */
  timeSpentSeconds: number;
  /** BCP-47 locale for feedback localisation; server defaults to "en". */
  locale?: string;
}

export interface AttemptFeedback {
  summary: string;
  hints?: string[];
  /** Only present when the attempt ran in PRACTICE mode. */
  correctAnswer?: unknown;
}

/**
 * Response of the submit endpoint (SubmitAnswerResponseDto). The templates that
 * route to human review (writing_task; translate_* unless every sentence hits the key)
 * come back `correct=false`, `requiresReview=true`; the teacher's mark arrives
 * later, in the review queue, which the app has no screen for.
 */
/**
 * What a listening exercise's clip said, delivered with the key — plan 56 §3.3.
 *
 * The transcript of a listening exercise *is* the answer, so it is dosed by the same
 * channel as the key rather than shipped with the projection: it arrives here, once, on
 * the verdict that closes the set, and only when the author chose `transcriptWhen:
 * 'after'`. Absent under every other policy — `always` travelled with the document, and
 * `never` is never.
 */
export interface AudioTranscript {
  transcript: string;
  translation: string;
}

export interface SubmitAttemptResponse {
  attemptId: string;
  correct: boolean;
  score: number | null;
  requiresReview: boolean;
  /**
   * Who will read an answer that `requiresReview` (plan 79, step 2.1c): the school's teacher,
   * a model, or nobody. `none` means the attempt is already closed as `NO_REVIEWER` — no
   * verdict is coming. Absent when nothing went to review, from older engines, and from the
   * phone's own engine (offline work is decided when it reaches the server).
   */
  reviewer?: 'teacher' | 'ai' | 'none';
  feedback: AttemptFeedback;
  /**
   * Per-item verdicts, for the templates graded item by item and only where the
   * validator's output is meant for the learner (`learnerFacingDetails` in
   * exercise-engine's `submit-answer.handler.ts` — a per-template allowance, not a
   * forwarded field, because several validators put the answer in here).
   *
   * Shape depends on `templateCode` and is read by the body that understands it —
   * `match_pairs` gets `{ totalPairs, correctPairs, pairs: [{ pairId, correct,
   * explanation }] }`. Absent for most templates, so every reader must tolerate
   * `undefined`.
   */
  details?: unknown;
  /** The clip's words, when this verdict is the one that earns them (plan 56 §3.3). */
  audioTranscript?: AudioTranscript;
}

/** What `GET /exercises/:id/answers` carries for grading on the phone. */
export interface ExerciseAnswersResponse {
  templateCode: string;
  /** The full content — unlike `/display`, not the student projection. */
  content: unknown;
  expectedAnswers: unknown;
  answerCheckSettings: Record<string, unknown> | null;
  instructions: ExerciseInstruction[] | null;
}

/**
 * `GET /exercises/:id/answers` (content-service) — the live document with its key. Asked
 * only for the templates the web grades in the browser too (`lib/offlineGrading`), whose key
 * was never a secret from the student's device; the phone keeps it to grade them offline
 * (offline plan, B5 group 1). The route sits behind the JWT alone, as for the web's reader —
 * its tighter guard is ssz-platform's open `block-5-followup`.
 */
export function getExerciseAnswers(id: string): Promise<ExerciseAnswersResponse> {
  return apiClient.get<ExerciseAnswersResponse>(EXERCISE_ANSWERS_PATH(id));
}

/**
 * When a call replayed from the offline journal was made on the phone (offline plan, B4), as
 * the engine reads it: `X-Client-At` the moment, `X-Client-Sent-At` the phone's clock as it
 * sends, so the server can correct for a clock that is wrong by a constant amount. The engine
 * bounds what it believes — never in the future, never before the attempt's last moment,
 * ignored past seven days. Absent on every online call, which the server dates itself.
 */
export interface ReplayTime {
  /** ISO 8601, by the phone's clock. */
  clientAt?: string;
}

/** `time` as a trailing argument, or none — an online call is made exactly as before. */
function timeArg(time?: ReplayTime): [] | [ReplayTime] {
  return time?.clientAt ? [time] : [];
}

/** The request options a replayed call adds — none at all for an online one. */
function replayHeaders(time?: ReplayTime): [] | [{ headers: Record<string, string> }] {
  if (!time?.clientAt) return [];
  return [
    { headers: { 'X-Client-At': time.clientAt, 'X-Client-Sent-At': new Date().toISOString() } },
  ];
}

/** `POST /exercises/:exerciseId/attempts` — start (create) an attempt. */
function remoteStartAttempt(
  exerciseId: string,
  body: StartAttemptRequest,
  time?: ReplayTime,
): Promise<StartAttemptResponse> {
  return apiClient.post<StartAttemptResponse>(ATTEMPTS_PATH(exerciseId), body, ...replayHeaders(time));
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/submit` — submit the
 * answer and get the server's verdict. Single-shot per attempt for almost
 * every template: the server rejects a second submit on an already-submitted
 * attempt.
 *
 * The exception is a re-check, which is deliberately this same call. A scored
 * *practice* attempt is reopened rather than refused — `word_bank_gap_fill`
 * unlimited, `multiple_choice_group` against the author's `retry` budget — and
 * what the engine refuses instead is a check of a table it has already closed:
 * all rows right, «Vis fasit», or the budget spent. So a caller must draw its
 * buttons from the last verdict's `closed`, never from a count it keeps
 * itself (plan 54 §3.3).
 */
function remoteSubmitAttempt(
  exerciseId: string,
  attemptId: string,
  body: SubmitAttemptRequest,
  time?: ReplayTime,
): Promise<SubmitAttemptResponse> {
  return apiClient.post<SubmitAttemptResponse>(
    SUBMIT_PATH(exerciseId, attemptId),
    body,
    ...replayHeaders(time),
  );
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/self-check` — how close the work in
 * progress is, before it is handed in (`translate_*`, `error_correction`).
 *
 * The draft travels in the shape the submission uses. Each call spends one of the author's
 * checks (`flow.selfCheck`), counted on the attempt; a spent budget is refused with 422. What
 * comes back is masked on the server — distances, counts, the task's own rules, never the
 * key's words — and its shape is the template's.
 */
function remoteSelfCheck(exerciseId: string, attemptId: string, draftAnswer: unknown): Promise<unknown> {
  return apiClient.post<unknown>(SELF_CHECK_PATH(exerciseId, attemptId), { draftAnswer });
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/reveal` — the answers of a submitted
 * `word_bank_gap_fill` (or `match_pairs`) attempt, and the note on why each is right.
 *
 * The only way the words leave the engine: a check says right or wrong and why, never what.
 * Asking is recorded on the attempt — shown answers are weaker evidence of knowing them — and
 * refused with 422 until something has been submitted. The shape is the template's; the body
 * that asked reads it.
 */
function remoteRevealAnswers(exerciseId: string, attemptId: string): Promise<unknown> {
  return apiClient.post<unknown>(REVEAL_PATH(exerciseId, attemptId), {});
}

/* ─────────────────────────────────────────────────────────────────────────
 * Answering one question of a `short_answer` set (plan 51 §3.3).
 *
 * The attempt is still one attempt — everything else (progress, SRS, the
 * review queue, the locks, the notifications) is built on "one attempt, one
 * submission, one thing a teacher marks". What changes is that a set of open
 * questions is handed in a question at a time: each answer is a command onto
 * the attempt that already exists, is graded on the server at once, and is
 * refused the second time. The last one closes the attempt with the ordinary
 * `submit`, carrying every answer in one aggregate, which the engine regrades
 * from scratch — nothing this device was told is trusted at the close.
 *
 * Grading has to be server-side here: the key is a set of anchor phrases, and
 * an anchor phrase is the answer written in the words the student is being
 * asked to find. So the text goes up and the verdict comes down; the app never
 * sees what the answer was matched against.
 *
 * `multiple_choice` answers on the same route since plan 53 §3.3, and for a reason of
 * its own. Its key is only an option id, so leaking it would teach nobody anything — but
 * the type is built on *dosing*: a second try and a 50/50 offered by a device that
 * already holds the key are decoration. So a pick goes up and the verdict comes down with
 * `keyOptionId` and the rule withheld until the question is closed. The command is the
 * same one, generalised rather than copied.
 *
 * Contract read 2026-08-25 from exercise-engine's attempts.controller.ts
 * (`@Post(':attemptId/answers')`), answer-question.handler.ts and
 * short-answer/projection.ts in @ssz/shared-kernel; re-read 2026-08-29 for the
 * multiple-choice payload (`answer-question.dto.ts`, `readPayload`).
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Body for `POST /exercises/:exerciseId/attempts/:attemptId/answers`.
 *
 * Two templates hand a set in a question at a time and they hand in different things, so
 * the body carries `text` **or** `optionId`, and the attempt's own template decides which
 * is read — a client that could name the kind would be naming which judge runs. `reveal`
 * is the one multiple-choice action that hands in nothing: it closes the question with
 * the key shown, spends no try and scores nothing.
 */
export interface AnswerQuestionRequest {
  /** Id of the question in the projected set. */
  questionId: string;
  /** `short_answer`: what the student wrote. Refused empty, server-side and here. */
  text?: string;
  /** `multiple_choice`: the option picked. Null only alongside `reveal`. */
  optionId?: string | null;
  /** `multiple_choice`: «Vis svaret» instead of another try. */
  reveal?: boolean;
}

/** The answer half of the body — what a runner hands in, without saying which question. */
export type AnswerQuestionAnswer = Omit<AnswerQuestionRequest, 'questionId'>;

/**
 * Response of the answers endpoint (AnswerQuestionResponseDto). `result` is the
 * kernel's student projection of the grade — the verdict, the coverage counts,
 * the element labels with a hit flag, the teacher's explanation, and the model
 * answer only where `showModel` allows it. It is typed as `unknown` here and
 * read by `readShortAnswerResult`, the same way display content is: this module
 * knows the envelope, the template module knows the shape.
 */
export interface AnswerQuestionResponse {
  attemptId: string;
  /**
   * Which shape `result` came back in. Two templates answer on this route with different
   * verdicts, and the envelope says which rather than leaving it to be guessed.
   */
  templateCode: ExerciseTemplateCode;
  /** How many of the set have been handed in, including this one. */
  answered: number;
  /** How many there are to answer. */
  total: number;
  result: unknown;
  /** Whether this answer is on its way to a teacher, for the routing line. */
  routedForReview: boolean;
  /**
   * The clip's words, on the verdict that closes the last question of the set.
   *
   * One clip serves the whole set, so the engine hands the transcript over only with the
   * last verdict — there is nothing left for it to give away by then. The body shows what
   * it is given and decides nothing (plan 56 §3.3).
   */
  audioTranscript?: AudioTranscript;
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/answers` — hand in one
 * question and get its verdict. Final: the engine refuses a second answer to
 * the same question (422), as it refuses one on a closed attempt.
 */
function remoteAnswerQuestion(
  exerciseId: string,
  attemptId: string,
  body: AnswerQuestionRequest,
  time?: ReplayTime,
): Promise<AnswerQuestionResponse> {
  return apiClient.post<AnswerQuestionResponse>(
    ANSWERS_PATH(exerciseId, attemptId),
    body,
    ...replayHeaders(time),
  );
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/items` — the probe a `minimal_pairs`
 * sitting is on (plan 72 §3.6): its clip, its buttons and where the sitting stands, never
 * which button is the key. Idempotent — asking again hands the same probe back until it is
 * answered. Once every probe is closed it refuses with 422 `ALL_PROBES_CLOSED`, which means
 * the submit is what is left. The body is read by `readProbe` in the template module.
 */
export function handOutProbe(exerciseId: string, attemptId: string): Promise<unknown> {
  return isLocal(attemptId)
    ? local!.handOutProbe(attemptId)
    : apiClient.post<unknown>(ITEMS_PATH(exerciseId, attemptId), {});
}

/**
 * `GET /exercises/:exerciseId/attempts/probe-history` — the learner's own `minimal_pairs` record
 * in the exercise's language, what `weakest` deals from (offline plan, B6). Kept by the course
 * download so a sitting dealt offline reads what the server would have.
 */
export function getProbeHistory(
  exerciseId: string,
): Promise<{ targetLanguage: string; sittings: Array<{ probes: unknown[] }> }> {
  return apiClient.get(`${ATTEMPTS_PATH(exerciseId)}/probe-history`);
}

/** `DELETE /exercises/:exerciseId/attempts/:attemptId` — an in-progress attempt abandoned. */
function remoteAbandonAttempt(exerciseId: string, attemptId: string): Promise<void> {
  return apiClient.delete<void>(ATTEMPT_PATH(exerciseId, attemptId));
}

/* ─────────────────────────────────────────────────────────────────────────
 * Checking one sentence of a `sentence_schema` set (plan 52 §3.3).
 *
 * The attempt is still one attempt, and the set is worked through a sentence
 * at a time — but unlike `short_answer`, whose answers are final, a sentence
 * here may be checked as often as the learner likes: being wrong is a step in
 * solving it, not a verdict. `Sjekk`, then `Rett opp` keeping what was right,
 * then `Sjekk` again. What ends a sentence is solving it or asking to be shown
 * it (`reveal`), and a shown sentence scores nothing.
 *
 * Grading has to be server-side here: the key is which field each chunk
 * belongs in, and the note under the board is resolved from the author's
 * per-chunk notes and the sentence's rule — all of it key. So the board goes
 * up and the marks come down; the app never holds what the board is judged
 * against.
 *
 * Contract read 2026-08-27 from exercise-engine's attempts.controller.ts
 * (`@Post(':attemptId/rows')`), check-row.dto.ts and check-row.handler.ts, and
 * sentence-schema/projection.ts in @ssz/shared-kernel.
 * ────────────────────────────────────────────────────────────────────── */

/** Body for `POST /exercises/:exerciseId/attempts/:attemptId/rows`. */
export interface CheckRowRequest {
  /** Which sentence of the set is being checked. */
  rowId: string;
  /** field id → the ids stacked in it, in the order they were placed. */
  placement: Record<string, string[]>;
  /** «Vis riktig skjema»: close the sentence with the answer shown, scoring nothing. */
  reveal?: boolean;
}

/**
 * Response of the rows endpoint (CheckRowResponseDto). `result` is the kernel's student
 * projection of the marks — per piece, per field, the attempt number, the resolved note,
 * and the key itself (`text`, `why`, `solution`) only once the sentence is closed. Typed
 * as `unknown` here and read by `readSentenceSchemaResult`, the same way display content
 * is: this module knows the envelope, the template module knows the shape.
 */
export interface CheckRowResponse {
  attemptId: string;
  /** Sentences closed — solved or revealed — including this one. */
  closed: number;
  total: number;
  result: unknown;
  /** The clip's words, on the check that closes the last sentence (plan 56 §3.3). */
  audioTranscript?: AudioTranscript;
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/rows` — check one sentence.
 *
 * Repeatable, unlike the answers endpoint: only a sentence already solved or revealed is
 * refused (422), as is a board with nothing on it (400).
 */
function remoteCheckRow(
  exerciseId: string,
  attemptId: string,
  body: CheckRowRequest,
  time?: ReplayTime,
): Promise<CheckRowResponse> {
  return apiClient.post<CheckRowResponse>(ROWS_PATH(exerciseId, attemptId), body, ...replayHeaders(time));
}

/* ─────────────────────────────────────────────────────────────────────────
 * Picking a set back up (plan 51 §8 Q6).
 *
 * A `short_answer` answer is handed in for good, and the engine keeps the
 * attempt open until the set is closed. So an app killed mid-set leaves
 * questions that are answered on the server and unanswered on the device, and
 * walking the set again would mean pressing `Lever svaret` on a question the
 * engine refuses.
 *
 * The attempt is read rather than started: opening an exercise and leaving must
 * still create nothing (`useExerciseRunner.openAttempt`), so this is a GET, and
 * a set with nothing answered simply comes back with nothing in it.
 * ────────────────────────────────────────────────────────────────────── */

/** One question of a set already handed in on an open attempt. */
export interface AnsweredQuestion {
  questionId: string;
  text: string;
  verdict: string;
}

/**
 * One sentence of a `sentence_schema` set already worked on in the open attempt.
 *
 * `revealed` is the one that has to survive being killed and reopened: the learner was
 * shown that sentence, so it is closed and scores nothing. Reopening it would make
 * force-quitting the app the cheapest way to a full mark.
 */
export interface CheckedRow {
  rowId: string;
  attempts: number;
  placement: Record<string, string[]>;
  solved: boolean;
  revealed: boolean;
}

/**
 * One question of a `multiple_choice` set already picked at in the open attempt.
 *
 * `picks` is the score, not a history: only a first-attempt hit counts, so a set replayed
 * from the top would hand out a fresh first try at every question — the cheapest possible
 * full mark. `eliminated` is what a 50/50 has already spent there, and it survives for
 * the same reason.
 */
export interface PickedOption {
  questionId: string;
  picks: string[];
  eliminated: string[];
  correct: boolean;
  closed: boolean;
  revealed: boolean;
}

/**
 * One question of a `highlight_in_text` exercise already checked in the open attempt
 * (plan 67, §8 caveat 7).
 *
 * `checks` and `closed` are what must survive a reload: the first check of each question is
 * the evidence and its budget is per question, so an exercise replayed from the top would
 * hand out a fresh first try. Read as `unknown` and parsed by the template module, which owns
 * the shape.
 */
export type QuestionStateRow = unknown;

/**
 * One sentence of a `dictation` exercise already checked or revealed in the open attempt
 * (plan 68, phase 4). Its own field beside `questionStates`, as the engine names it: the
 * shapes differ — a sentence carries the last checked text, the corrected line the learner
 * was shown, and the sentence once revealed. Read as `unknown` and parsed by the template
 * module, which owns the shape.
 */
export type SegmentStateRow = unknown;

/** The open attempt at this exercise, as far as a resuming runner needs it. */
export interface OpenAttempt {
  attemptId: string;
  answeredQuestions: AnsweredQuestion[];
  checkedRows: CheckedRow[];
  pickedOptions: PickedOption[];
  questionStates: QuestionStateRow[];
  segmentStates: SegmentStateRow[];
}

interface AttemptListRow {
  id: string;
  status: string;
  answeredQuestions?: AnsweredQuestion[] | null;
  checkedRows?: CheckedRow[] | null;
  pickedOptions?: PickedOption[] | null;
  questionStates?: QuestionStateRow[] | null;
  segmentStates?: SegmentStateRow[] | null;
}

/**
 * The last check of an `inflection_table` or `information_transfer` that was scored but left open, or `null` (plan 69,
 * phase 9).
 *
 * A whole table is scored by its first check, so unlike a question-by-question set it is never
 * `IN_PROGRESS` between checks and `findOpenAttempt` cannot see it. It is the newest attempt
 * that is not still opening, and only when its last check left the table open — the engine's
 * own rule for what it will resume, so that a start made afterwards joins this very attempt.
 * The details are returned as the engine stored them, for the template module to parse.
 *
 * Fails soft, as `findOpenAttempt` does: a table that cannot be resumed is played from the top.
 */
async function remoteFindOpenBoardCheck(exerciseId: string): Promise<unknown> {
  try {
    const page = await apiClient.get<{
      items: Array<{
        status: string;
        templateCode?: string;
        validationDetails?: unknown;
      }>;
    }>(ATTEMPTS_PATH(exerciseId), { query: { limit: 5 } });
    const newest = (page.items ?? []).find(a => a.status !== 'IN_PROGRESS');
    if (!newest || newest.status !== 'SCORED') return null;
    if (
      newest.templateCode !== 'inflection_table' &&
      newest.templateCode !== 'information_transfer'
    )
      return null;
    const details = newest.validationDetails as { closed?: unknown } | null;
    return details?.closed === false ? details : null;
  } catch {
    return null;
  }
}

/**
 * `GET /exercises/:exerciseId/attempts?status=IN_PROGRESS` — the attempt this
 * learner has open at this exercise, or `null`.
 *
 * Fails soft on purpose: a set that cannot be resumed is played from the top,
 * which is what happened before there was anything to resume. Losing the
 * network on the way in must not cost the exercise.
 */
async function remoteFindOpenAttempt(exerciseId: string): Promise<OpenAttempt | null> {
  try {
    const page = await apiClient.get<{ items: AttemptListRow[] }>(ATTEMPTS_PATH(exerciseId), {
      query: { status: 'IN_PROGRESS', limit: 1 },
    });
    const open = page.items?.[0];
    if (!open) return null;
    return {
      attemptId: open.id,
      answeredQuestions: open.answeredQuestions ?? [],
      checkedRows: open.checkedRows ?? [],
      pickedOptions: open.pickedOptions ?? [],
      questionStates: open.questionStates ?? [],
      segmentStates: open.segmentStates ?? [],
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * A `read_aloud` attempt: recorded over time, handed in once (plan 70, phase 10).
 *
 * A spoken answer is not made in one go. Each take is uploaded the moment it is recorded, as
 * an asset of the attempt it answers — so the attempt has to exist before the first upload,
 * and a phone killed between takes must find the same attempt again, or every take already
 * uploaded would belong to an attempt nobody can hand in. Hence three things the other
 * templates do not need: a start that *joins* the attempt already in progress, the draft
 * that keeps the uploaded takes on it, and a read of the past to know whether the work is
 * already with a teacher.
 *
 * Contract read 2026-10-07 from exercise-engine's attempts.controller.ts (`@Post()` with
 * `joinAttemptId`, `@Put(':attemptId/draft')`, `@Get(':attemptId')`, `@Get()`) and
 * start-attempt.handler.ts (a 409 names the attempt in `attemptId`).
 * ────────────────────────────────────────────────────────────────────── */

/** One of this learner's attempts at an exercise, as far as `read_aloud` needs it. */
export interface AttemptRow {
  id: string;
  status: string;
  /** When the attempt began, ISO 8601 — read by the offline replay to tell its own from another's. */
  startedAt?: string;
  templateCode: string;
  submittedAnswer: unknown;
  draftAnswer: unknown;
  /** The teacher's verdict on the whole submission; null until there is one. */
  passed?: boolean | null;
  /** A word on the submission as a whole, when the teacher left one. */
  reviewComment?: string | null;
  /** Per prompt for `read_aloud`: whether it passed, and the teacher's comment on it. */
  reviewDecisions?: unknown;
  /** `itemId:criterionId` → 0–3, only once a verdict is delivered. */
  rubricMarks?: unknown;
  /** The rubric frozen when the work was queued, only once a verdict is delivered. */
  rubricSnapshot?: unknown;
}

/**
 * The attempt for this exercise that the learner may record into: a new one, or the one
 * already in progress.
 *
 * A start refused with 409 names the open attempt, and the start is made again naming it —
 * the engine's own way to hand back an attempt a caller already knows of. Only a 409 that
 * carries the id is answered like this; every other refusal is the caller's.
 */
async function remoteStartOrJoinAttempt(
  exerciseId: string,
  body: StartAttemptRequest,
  time?: ReplayTime,
): Promise<StartAttemptResponse> {
  try {
    return await remoteStartAttempt(exerciseId, body, ...timeArg(time));
  } catch (e) {
    const open = conflictAttemptId(e);
    if (open === null) throw e;
    return remoteStartAttempt(exerciseId, { ...body, joinAttemptId: open }, ...timeArg(time));
  }
}

function conflictAttemptId(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const body = e.body as { attemptId?: unknown } | null;
  return typeof body?.attemptId === 'string' && body.attemptId !== '' ? body.attemptId : null;
}

/**
 * `PUT /exercises/:exerciseId/attempts/:attemptId/draft` — keep the work in progress. Stored as
 * it arrives and never read by the submit: for `read_aloud`, the uploaded takes and the choice
 * between them (the kernel's `toDraft`).
 */
function remoteSaveDraft(
  exerciseId: string,
  attemptId: string,
  draftAnswer: unknown,
  time?: ReplayTime,
): Promise<{ savedAt: string }> {
  return apiClient.put<{ savedAt: string }>(
    DRAFT_PATH(exerciseId, attemptId),
    { draftAnswer },
    ...replayHeaders(time),
  );
}

/** `GET /exercises/:exerciseId/attempts/:attemptId` — one attempt, to see how a failed submit left it. */
function remoteGetAttempt(exerciseId: string, attemptId: string): Promise<AttemptRow> {
  return apiClient.get<AttemptRow>(ATTEMPT_PATH(exerciseId, attemptId));
}

/**
 * The learner's most recent attempts at this exercise, newest first.
 *
 * Fails soft, like `findOpenAttempt`: a history that cannot be read leaves the learner at a
 * fresh recorder, which is where they would have been anyway.
 */
async function remoteRecentAttempts(exerciseId: string, limit = 5): Promise<AttemptRow[]> {
  const page = await apiClient.get<{ items: AttemptRow[] }>(ATTEMPTS_PATH(exerciseId), {
    query: { limit },
  });
  return page.items ?? [];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Attempts without the server (offline plan, B4).
 *
 * Every attempt call above has a twin on the phone: `src/offline/engine` runs the engine's
 * commands against the downloaded key. An attempt started there has an id that says so
 * (`offline:…`), and every later call about it is answered there — the bodies and the runner
 * call the same functions whichever side answers. A start goes to the phone when the server
 * cannot be reached and the exercise was downloaded with its key, or when an attempt begun
 * offline is still open: the work continues where it was, and its journal is replayed to the
 * server later (`exerciseOutboxStore`), never mixed with a fresh server attempt.
 *
 * `remoteAttempts` is the server side alone, for that replay: a replay must fail when the
 * server is away, not fall back to the phone it is replaying from.
 * ────────────────────────────────────────────────────────────────────── */

/** What `src/offline/engine` answers with; refusals come as `ApiError`, as the server's do. */
export interface LocalAttempts {
  isLocal(attemptId: string): boolean;
  hasOpenAttempt(exerciseId: string): Promise<boolean>;
  canStart(exerciseId: string): Promise<boolean>;
  start(exerciseId: string, body: StartAttemptRequest): Promise<StartAttemptResponse>;
  submit(attemptId: string, body: SubmitAttemptRequest): Promise<SubmitAttemptResponse>;
  answerQuestion(attemptId: string, body: AnswerQuestionRequest): Promise<AnswerQuestionResponse>;
  handOutProbe(attemptId: string): Promise<unknown>;
  checkRow(attemptId: string, body: CheckRowRequest): Promise<CheckRowResponse>;
  revealAnswers(attemptId: string): Promise<unknown>;
  selfCheck(attemptId: string, draftAnswer: unknown): Promise<unknown>;
  saveDraft(attemptId: string, draftAnswer: unknown): Promise<{ savedAt: string }>;
  getAttempt(attemptId: string): Promise<AttemptRow>;
  findOpenAttempt(exerciseId: string): Promise<OpenAttempt | null>;
  findOpenBoardCheck(exerciseId: string): Promise<unknown>;
  recentAttempts(exerciseId: string, limit: number): Promise<AttemptRow[]>;
}

let local: LocalAttempts | null = null;

export function setLocalAttempts(engine: LocalAttempts | null): void {
  local = engine;
}

export const remoteAttempts = {
  startAttempt: remoteStartAttempt,
  startOrJoinAttempt: remoteStartOrJoinAttempt,
  abandonAttempt: remoteAbandonAttempt,
  getAttempt: remoteGetAttempt,
  submitAttempt: remoteSubmitAttempt,
  answerQuestion: remoteAnswerQuestion,
  checkRow: remoteCheckRow,
  revealAnswers: remoteRevealAnswers,
  selfCheck: remoteSelfCheck,
  saveDraft: remoteSaveDraft,
};

const isLocal = (attemptId: string) => local !== null && local.isLocal(attemptId);

/** `POST /exercises/:exerciseId/attempts` — on the server, or on the phone when it must be. */
export async function startAttempt(
  exerciseId: string,
  body: StartAttemptRequest,
): Promise<StartAttemptResponse> {
  if (local && (await local.hasOpenAttempt(exerciseId))) return local.start(exerciseId, body);
  try {
    return await remoteStartAttempt(exerciseId, body);
  } catch (e) {
    if (local && isServerOutOfReach(e) && (await local.canStart(exerciseId))) {
      return local.start(exerciseId, body);
    }
    throw e;
  }
}

/** The attempt to record into: a new one, or the one in progress — wherever it lives. */
export async function startOrJoinAttempt(
  exerciseId: string,
  body: StartAttemptRequest,
): Promise<StartAttemptResponse> {
  try {
    return await startAttempt(exerciseId, body);
  } catch (e) {
    const open = conflictAttemptId(e);
    if (open === null) throw e;
    return isLocal(open)
      ? local!.start(exerciseId, { ...body, joinAttemptId: open })
      : remoteStartAttempt(exerciseId, { ...body, joinAttemptId: open });
  }
}

export function submitAttempt(
  exerciseId: string,
  attemptId: string,
  body: SubmitAttemptRequest,
): Promise<SubmitAttemptResponse> {
  return isLocal(attemptId)
    ? local!.submit(attemptId, body)
    : remoteSubmitAttempt(exerciseId, attemptId, body);
}

export function answerQuestion(
  exerciseId: string,
  attemptId: string,
  body: AnswerQuestionRequest,
): Promise<AnswerQuestionResponse> {
  return isLocal(attemptId)
    ? local!.answerQuestion(attemptId, body)
    : remoteAnswerQuestion(exerciseId, attemptId, body);
}

export function checkRow(
  exerciseId: string,
  attemptId: string,
  body: CheckRowRequest,
): Promise<CheckRowResponse> {
  return isLocal(attemptId)
    ? local!.checkRow(attemptId, body)
    : remoteCheckRow(exerciseId, attemptId, body);
}

export function revealAnswers(exerciseId: string, attemptId: string): Promise<unknown> {
  return isLocal(attemptId)
    ? local!.revealAnswers(attemptId)
    : remoteRevealAnswers(exerciseId, attemptId);
}

export function selfCheck(
  exerciseId: string,
  attemptId: string,
  draftAnswer: unknown,
): Promise<unknown> {
  return isLocal(attemptId)
    ? local!.selfCheck(attemptId, draftAnswer)
    : remoteSelfCheck(exerciseId, attemptId, draftAnswer);
}

export function saveDraft(
  exerciseId: string,
  attemptId: string,
  draftAnswer: unknown,
): Promise<{ savedAt: string }> {
  return isLocal(attemptId)
    ? local!.saveDraft(attemptId, draftAnswer)
    : remoteSaveDraft(exerciseId, attemptId, draftAnswer);
}

export function getAttempt(exerciseId: string, attemptId: string): Promise<AttemptRow> {
  return isLocal(attemptId)
    ? local!.getAttempt(attemptId)
    : remoteGetAttempt(exerciseId, attemptId);
}

/** The open attempt at this exercise: one begun on the phone first, then the server's. */
export async function findOpenAttempt(exerciseId: string): Promise<OpenAttempt | null> {
  const here = local ? await local.findOpenAttempt(exerciseId) : null;
  return here ?? remoteFindOpenAttempt(exerciseId);
}

export async function findOpenBoardCheck(exerciseId: string): Promise<unknown> {
  const here = local ? await local.findOpenBoardCheck(exerciseId) : null;
  return here ?? remoteFindOpenBoardCheck(exerciseId);
}

/** Recent attempts — the server's, or the phone's when the server cannot be asked. */
export async function recentAttempts(exerciseId: string, limit = 5): Promise<AttemptRow[]> {
  try {
    return await remoteRecentAttempts(exerciseId, limit);
  } catch {
    return local ? local.recentAttempts(exerciseId, limit) : [];
  }
}
