import { apiClient } from './client';
import { isRecord, isString } from './guards';
import { isLocalAttempt } from './exercises';
import { parseFeedback, PrecheckUnavailableError, type PrecheckResult } from './precheck';

/* ─────────────────────────────────────────────────────────────────────────
 * One sentence of a reading, heard on its own (platform plan 86, steps 6g.2 and 7e.2).
 *
 * exercise-engine `POST /exercises/:exerciseId/attempts/:attemptId/sentence-checks`
 * `{ itemId, sentence, recordingAssetId, explanationLanguage }`. Only a `read_aloud` attempt
 * in progress; nothing about the attempt moves, and the rehearsal's limits are not touched
 * (ai-service keeps its own per-sentence limit). The school's switch still holds: 403
 * `PRECHECK_NOT_AVAILABLE`, and 409 `NOT_IN_PROGRESS` once the work is handed in, arrive as the
 * `ApiError` they are and are final. Everything the model itself can answer is a 200.
 * ────────────────────────────────────────────────────────────────────── */

const sentenceCheckPath = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/sentence-checks`;

/** One model call on one sentence; a minute is more than the engine waits for it. */
const SENTENCE_CHECK_TIMEOUT_MS = 65000;

export interface SentenceCheckRequest {
  /** The prompt the sentence belongs to. */
  itemId: string;
  /** The sentence as written; the engine verifies it is words of that prompt's passage. */
  sentence: string;
  /** The take, uploaded as a `submission_recording` of this attempt. */
  recordingAssetId: string;
  /** The language the sounds are explained in; the app's language. */
  explanationLanguage: string;
}

/**
 * What came back, in the shape the rehearsal's panel draws — the same `AiFeedback`, so one
 * panel serves both. `refused.reason` is ai-service's (`attempt_limit`, `pool_empty`,
 * `language_not_supported`, `not_available`), `failed.errorCode` its own (`recording_*`, …).
 */
export type SentenceCheckAnswer = PrecheckResult;

/** Null when the answer is not one this app can read. */
export function parseSentenceCheck(raw: unknown): SentenceCheckAnswer | null {
  if (!isRecord(raw)) return null;
  const base = { courseId: null, selfCheck: null, reading: null, remaining: null };
  switch (raw.status) {
    case 'ok': {
      const feedback = parseFeedback(raw.feedback);
      return feedback === null ? null : { ...base, ai: { status: 'ok' }, feedback };
    }
    case 'refused':
      return {
        ...base,
        ai: { status: 'refused', reason: isString(raw.reason) ? raw.reason : 'unknown' },
        feedback: null,
      };
    case 'failed':
      return {
        ...base,
        ai: { status: 'failed', errorCode: isString(raw.errorCode) ? raw.errorCode : 'unknown' },
        feedback: null,
      };
    default:
      return null;
  }
}

export async function checkSentence(
  exerciseId: string,
  attemptId: string,
  request: SentenceCheckRequest,
): Promise<SentenceCheckAnswer> {
  // An attempt started offline exists only on this phone: the server has never heard of it.
  if (isLocalAttempt(attemptId)) throw new PrecheckUnavailableError('offline');
  const answer = parseSentenceCheck(
    await apiClient.post<unknown>(sentenceCheckPath(exerciseId, attemptId), request, {
      timeoutMs: SENTENCE_CHECK_TIMEOUT_MS,
    }),
  );
  if (answer === null) throw new PrecheckUnavailableError('unreadable');
  return answer;
}
