import { apiClient } from './client';
import type { DifficultyLevel, ExerciseDisplay, ExerciseTemplateCode } from './types';

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
const ATTEMPTS_PATH = (exerciseId: string) => `/api/v1/exercises/${exerciseId}/attempts`;
const SUBMIT_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/submit`;
const ANSWERS_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/answers`;

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
 * route to human review (translate_*, writing_task) come back
 * `correct=false`, `score=null`, `requiresReview=true`; the teacher's mark arrives
 * later, in the review queue, which the app has no screen for.
 */
export interface SubmitAttemptResponse {
  attemptId: string;
  correct: boolean;
  score: number | null;
  requiresReview: boolean;
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
}

/** `POST /exercises/:exerciseId/attempts` — start (create) an attempt. */
export function startAttempt(
  exerciseId: string,
  body: StartAttemptRequest,
): Promise<StartAttemptResponse> {
  return apiClient.post<StartAttemptResponse>(ATTEMPTS_PATH(exerciseId), body);
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/submit` — submit the
 * answer and get the server's verdict. Single-shot per attempt: the server
 * rejects a second submit on an already-submitted attempt.
 */
export function submitAttempt(
  exerciseId: string,
  attemptId: string,
  body: SubmitAttemptRequest,
): Promise<SubmitAttemptResponse> {
  return apiClient.post<SubmitAttemptResponse>(SUBMIT_PATH(exerciseId, attemptId), body);
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
 * Contract read 2026-08-25 from exercise-engine's attempts.controller.ts
 * (`@Post(':attemptId/answers')`), answer-question.handler.ts and
 * short-answer/projection.ts in @ssz/shared-kernel.
 * ────────────────────────────────────────────────────────────────────── */

/** Body for `POST /exercises/:exerciseId/attempts/:attemptId/answers`. */
export interface AnswerQuestionRequest {
  /** Id of the question in the projected set. */
  questionId: string;
  /** The student's answer. Refused empty, server-side and here. */
  text: string;
}

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
  /** How many of the set have been handed in, including this one. */
  answered: number;
  /** How many there are to answer. */
  total: number;
  result: unknown;
  /** Whether this answer is on its way to a teacher, for the routing line. */
  routedForReview: boolean;
}

/**
 * `POST /exercises/:exerciseId/attempts/:attemptId/answers` — hand in one
 * question and get its verdict. Final: the engine refuses a second answer to
 * the same question (422), as it refuses one on a closed attempt.
 */
export function answerQuestion(
  exerciseId: string,
  attemptId: string,
  body: AnswerQuestionRequest,
): Promise<AnswerQuestionResponse> {
  return apiClient.post<AnswerQuestionResponse>(ANSWERS_PATH(exerciseId, attemptId), body);
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

/** The open attempt at this exercise, as far as a resuming runner needs it. */
export interface OpenAttempt {
  attemptId: string;
  answeredQuestions: AnsweredQuestion[];
}

interface AttemptListRow {
  id: string;
  status: string;
  answeredQuestions?: AnsweredQuestion[] | null;
}

/**
 * `GET /exercises/:exerciseId/attempts?status=IN_PROGRESS` — the attempt this
 * learner has open at this exercise, or `null`.
 *
 * Fails soft on purpose: a set that cannot be resumed is played from the top,
 * which is what happened before there was anything to resume. Losing the
 * network on the way in must not cost the exercise.
 */
export async function findOpenAttempt(exerciseId: string): Promise<OpenAttempt | null> {
  try {
    const page = await apiClient.get<{ items: AttemptListRow[] }>(ATTEMPTS_PATH(exerciseId), {
      query: { status: 'IN_PROGRESS', limit: 1 },
    });
    const open = page.items?.[0];
    if (!open) return null;
    return { attemptId: open.id, answeredQuestions: open.answeredQuestions ?? [] };
  } catch {
    return null;
  }
}
