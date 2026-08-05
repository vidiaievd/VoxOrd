import { apiClient } from './client';
import type { ProgressRecord, UpsertProgressRequest } from './types';
import type { SubmitAttemptResponse } from './exercises';

const PROGRESS_PATH = '/api/v1/progress';

/**
 * `POST /progress` (learning-service). `contentType` must be one of
 * learning-service's uppercase wire values (`LESSON`, `VOCABULARY_LIST`,
 * `GRAMMAR_RULE`, `EXERCISE`, `CONTAINER` — see `content-ref.ts`'s
 * `VALID_CONTENT_TYPES`), and `contentId` is the content-service id (e.g.
 * the lesson id, not a variant id). Confirmed against
 * upsert-progress.request.ts + how the web reader's "Next" action posts
 * lesson completion (reader-shell.tsx `handleNext`).
 */
export async function upsertProgress(
  request: UpsertProgressRequest,
): Promise<ProgressRecord> {
  return apiClient.post<ProgressRecord>(PROGRESS_PATH, request);
}

/**
 * Mirrors the web reader's `handleNext`: time spent is measured from when
 * the item was opened, `score` is omitted for lessons (no scoring concept
 * for plain reading), and `completed` is always true — this is only called
 * from an explicit "mark as read" action, never fired automatically.
 */
export function buildLessonCompletionRequest(
  lessonId: string,
  startedAtMs: number,
  nowMs: number = Date.now(),
): UpsertProgressRequest {
  return {
    contentType: 'LESSON',
    contentId: lessonId,
    timeSpentSeconds: Math.max(0, Math.round((nowMs - startedAtMs) / 1000)),
    completed: true,
  };
}

/**
 * One `POST /progress` per finished exercise (there is no "set" concept on
 * the backend — `EXERCISE` is a singular content type, see
 * `VALID_CONTENT_TYPES` in learning-service's content-ref.ts — so the
 * runner posts once per item in the set it just completed). `score` is the
 * server's 0-100 verdict score passed straight through: exercise-engine's
 * validators and the progress DTO already share that scale.
 */
export function buildExerciseCompletionRequest(
  exerciseId: string,
  verdict: SubmitAttemptResponse,
  timeSpentSeconds: number,
): UpsertProgressRequest {
  return {
    contentType: 'EXERCISE',
    contentId: exerciseId,
    timeSpentSeconds,
    score: verdict.score ?? undefined,
    completed: true,
  };
}
