import { ApiError, apiClient } from './client';

/* ─────────────────────────────────────────────────────────────────────────
 * A model's review of the learner's own work (plan 79, step 2.3d).
 *
 * Only for the learner nobody reviews: no school, the work read by a model on their own plan
 * (`reviewer: 'ai'` on the hand-in). Everything here is written to the learner — the model,
 * its prompt and its cost stay in the engine and ai-service — and the screen must label it as
 * a review by AI, never as a teacher's word.
 *
 * Contract read 2026-10-24 from exercise-engine's ai-review.controller.ts and
 * learner-ai-review.dto.ts (`GET` and `POST dispute` under the attempt). The web reads the
 * same routes through its BFF, which also names the marks; the phone names them itself from
 * the attempt's `rubricSnapshot` (`criterionNames`).
 * ────────────────────────────────────────────────────────────────────── */

const AI_REVIEW_PATH = (exerciseId: string, attemptId: string) =>
  `/api/v1/exercises/${exerciseId}/attempts/${attemptId}/ai-review`;

/** One remark on one item of the answer. */
export interface AiReviewRemark {
  /** The sentence, question, or `text` of an essay the remark is about. */
  itemId: string;
  /** Position of that item in the exercise, from 0. */
  sentenceIndex: number;
  /**
   * `grammar`, `order`, `lexis`, `register`, `meaning`, `alternative`, `task`, `structure`,
   * `content`. Kept as a string: an aspect this app has not heard of reads under its own code
   * rather than failing the review.
   */
  aspect: string;
  /** The words of the answer it points at; `null` for a remark on the answer as a whole. */
  fragment: string | null;
  comment: string;
  suggestion: string | null;
}

/** A mark the model gave out of the essay's rubric, with why. */
export interface AiReviewMark {
  /** As in the attempt's `rubricSnapshot`. */
  criterionId: string;
  mark: 0 | 1 | 2 | 3;
  reason: string;
}

/**
 * One step of the reading check, in passage order (the kernel's `ReadingOp`): a passage word
 * read, read as another word, or missed; or a word heard that is not in the passage. `i` is
 * the passage word's index; a `read` may cover `n` passage words the recognizer glued.
 */
export type AiReadingOp =
  | { k: 'read'; i: number; n: number; heard: string; focus: boolean }
  | { k: 'misread'; i: number; expected: string; heard: string; focus: boolean }
  | { k: 'missed'; i: number; expected: string; focus: boolean }
  | { k: 'extra'; heard: string };

/** How a passage word was pronounced — Azure's own alignment, feedback only. */
export interface AiPronouncedWord {
  text: string;
  /** 0–100. */
  accuracy: number;
  error: 'none' | 'mispronunciation' | 'omission' | 'insertion';
}

/** Pronunciation scores, 0–100 — never part of the verdict (plan 82 §2.3). */
export interface AiPronunciation {
  accuracy: number;
  fluency: number;
  completeness: number;
  /** Null where the language has none (`nb`). */
  prosody: number | null;
  words: AiPronouncedWord[];
}

/** What the machine heard in one prompt's recording, and the check the verdict stood on. */
export interface AiReadingPrompt {
  itemId: string;
  /** The recognizer's words as one string. */
  transcript: string;
  ops: AiReadingOp[];
  /** Passage words, and those read. */
  total: number;
  read: number;
  /** Whole percent, rounded down — what the pass mark is measured against. */
  percent: number;
  passed: boolean;
  /** Only on plans that include it; `null` otherwise. */
  pronunciation: AiPronunciation | null;
  /** Words a minute — a hint, only where the author asked for the pace; `null` otherwise. */
  wordsPerMinute: number | null;
}

/** A `read_aloud` work as the machine checked it (plan 82, step 7). */
export interface AiReading {
  /** The share of a prompt's words it had to read, as ruled. */
  passPercent: number;
  /** In the exercise's order. */
  prompts: AiReadingPrompt[];
  /** Passed in an earlier try and not checked again (plan 70, phase 11b). */
  carriedItemIds: string[];
}

export interface AiReview {
  outcome: 'approved' | 'returned';
  items: AiReviewRemark[];
  /** The model's word on the answer as a whole — also the attempt's `reviewComment`. */
  summary: string | null;
  /** For an essay graded out of a rubric; `null` otherwise. */
  marks: AiReviewMark[] | null;
  /** For a `read_aloud` reading, checked by the machine; `null` for every other template. */
  reading: AiReading | null;
  reviewedAt: string;
  /** When the learner said the review is wrong; `null` until they do. */
  disputedAt: string | null;
  /**
   * A school's work under a model-first policy (plan 80): the verdict does not count yet — a
   * teacher will read the work. The engine takes no dispute on it while it waits.
   */
  provisional: boolean;
  /** For a provisional one: when it counts by itself if no teacher answers; null otherwise. */
  countsAt: string | null;
  /** It counted by itself — the school's term ran out with no teacher's answer (plan 80). */
  acceptedAtTerm: boolean;
}

/** As long as the engine takes it. */
export const DISPUTE_REASON_MAX = 1000;

/**
 * The review, or `null` when there is none (`NO_AI_REVIEW` — still waiting, a teacher's
 * verdict, nobody to read it): a caller that asked on a hunch gets nothing to draw. The fields
 * are copied one by one, so nothing added upstream reaches the screen by inheritance.
 */
export async function getAiReview(exerciseId: string, attemptId: string): Promise<AiReview | null> {
  let review: AiReview;
  try {
    review = await apiClient.get<AiReview>(AI_REVIEW_PATH(exerciseId, attemptId));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  return {
    outcome: review.outcome,
    items: (review.items ?? []).map(item => ({
      itemId: item.itemId,
      sentenceIndex: item.sentenceIndex,
      aspect: item.aspect,
      fragment: item.fragment ?? null,
      comment: item.comment,
      suggestion: item.suggestion ?? null,
    })),
    summary: review.summary ?? null,
    marks:
      review.marks == null
        ? null
        : review.marks.map(mark => ({
            criterionId: mark.criterionId,
            mark: mark.mark,
            reason: mark.reason,
          })),
    reading: readReading(review.reading),
    reviewedAt: review.reviewedAt,
    disputedAt: review.disputedAt ?? null,
    provisional: review.provisional === true,
    countsAt: review.provisional === true ? (review.countsAt ?? null) : null,
    acceptedAtTerm: review.acceptedAtTerm === true,
  };
}

/**
 * «This review is wrong» — once per review; a repeat answers with the time of the first press
 * and counts nothing. The reason travels trimmed, or not at all.
 */
export async function disputeAiReview(
  exerciseId: string,
  attemptId: string,
  reason: string,
): Promise<{ disputedAt: string }> {
  const trimmed = reason.trim().slice(0, DISPUTE_REASON_MAX);
  return apiClient.post<{ disputedAt: string }>(
    `${AI_REVIEW_PATH(exerciseId, attemptId)}/dispute`,
    trimmed === '' ? {} : { reason: trimmed },
  );
}

/**
 * The rubric's criteria as frozen on the attempt, id → name, in rubric order. The engine
 * sends the snapshot only once a verdict is delivered — which a model's is. Anything unread
 * costs the names, never the review.
 */
export function criterionNames(rubricSnapshot: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const criteria = (rubricSnapshot as { criteria?: unknown } | null | undefined)?.criteria;
  if (!Array.isArray(criteria)) return names;
  for (const criterion of criteria) {
    const { id, name } = (criterion ?? {}) as { id?: unknown; name?: unknown };
    if (typeof id === 'string') names.set(id, typeof name === 'string' ? name : '');
  }
  return names;
}

const PRONOUNCED_ERRORS: ReadonlySet<string> = new Set([
  'none',
  'mispronunciation',
  'omission',
  'insertion',
]);

/**
 * A `read_aloud` reading as the engine keeps it on a review (plan 82, step 7), copied field
 * by field into what the screen draws — or `null` when it is not one. The web BFF's
 * `readReading`.
 *
 * Read narrowly: the engine's copy also holds the words heard with their timings and the
 * audio's length, which no screen draws, and whatever it gains later must not reach a learner
 * by inheritance. A prompt that cannot be read is left out rather than failing the review; an
 * op that cannot be read is left out of its prompt.
 */
export function readReading(raw: unknown): AiReading | null {
  if (!isRecord(raw) || !Array.isArray(raw.prompts)) return null;
  const passPercent = num(raw.passPercent);
  if (passPercent === null) return null;
  return {
    passPercent,
    prompts: raw.prompts.flatMap((p): AiReadingPrompt[] => {
      const prompt = readPrompt(p);
      return prompt === null ? [] : [prompt];
    }),
    carriedItemIds: Array.isArray(raw.carriedItemIds)
      ? raw.carriedItemIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

function readPrompt(raw: unknown): AiReadingPrompt | null {
  if (!isRecord(raw) || typeof raw.itemId !== 'string' || !isRecord(raw.check)) return null;
  const total = num(raw.check.total);
  const read = num(raw.check.read);
  const percent = num(raw.percent);
  if (total === null || read === null || percent === null || typeof raw.passed !== 'boolean') {
    return null;
  }
  return {
    itemId: raw.itemId,
    transcript: typeof raw.transcript === 'string' ? raw.transcript : '',
    ops: Array.isArray(raw.check.ops)
      ? raw.check.ops.flatMap((op): AiReadingOp[] => {
          const one = readOp(op);
          return one === null ? [] : [one];
        })
      : [],
    total,
    read,
    percent,
    passed: raw.passed,
    pronunciation: readPronunciation(raw.pronunciation),
    wordsPerMinute: num(raw.wordsPerMinute),
  };
}

function readOp(raw: unknown): AiReadingOp | null {
  if (!isRecord(raw)) return null;
  const focus = raw.focus === true;
  const i = num(raw.i);
  const heard = typeof raw.heard === 'string' ? raw.heard : null;
  const expected = typeof raw.expected === 'string' ? raw.expected : null;
  switch (raw.k) {
    case 'read':
      return i === null || heard === null ? null : { k: 'read', i, n: num(raw.n) ?? 1, heard, focus };
    case 'misread':
      return i === null || heard === null || expected === null
        ? null
        : { k: 'misread', i, expected, heard, focus };
    case 'missed':
      return i === null || expected === null ? null : { k: 'missed', i, expected, focus };
    case 'extra':
      return heard === null ? null : { k: 'extra', heard };
    default:
      return null;
  }
}

function readPronunciation(raw: unknown): AiPronunciation | null {
  if (!isRecord(raw)) return null;
  const accuracy = num(raw.accuracy);
  const fluency = num(raw.fluency);
  const completeness = num(raw.completeness);
  if (accuracy === null || fluency === null || completeness === null) return null;
  return {
    accuracy,
    fluency,
    completeness,
    prosody: num(raw.prosody),
    words: Array.isArray(raw.words)
      ? raw.words.flatMap((w): AiPronouncedWord[] => {
          if (!isRecord(w) || typeof w.text !== 'string') return [];
          const score = num(w.accuracy);
          if (score === null || typeof w.error !== 'string' || !PRONOUNCED_ERRORS.has(w.error)) {
            return [];
          }
          return [{ text: w.text, accuracy: score, error: w.error as AiPronouncedWord['error'] }];
        })
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
