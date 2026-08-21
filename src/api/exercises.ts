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
 * Response of the submit endpoint (SubmitAnswerResponseDto). Free-form
 * templates (translate_*, writing_task) route to human review:
 * `correct=false`, `score=null`, `requiresReview=true`.
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
