import type { AttemptRow, SubmitAttemptResponse } from '../../../api/exercises';
import { readEcTask, type StudentEdits } from './errorCorrection';
import { readShortAnswerSet } from './shortAnswer';
import { readTranslateTask } from './translate';
import { readWritingTaskContent } from './writingTask';

/**
 * Work handed in to be read, shown again when the learner comes back to it (OQ-S3 s19).
 *
 * The runner opened every exercise as a fresh attempt. For the templates a person (or a model)
 * reads, that hid the work already sent — the text, the provisional verdict, the teacher's — and
 * offered to hand it in a second time. The web reopens such an exercise on its last finished
 * attempt (`fetchLastAttempt` + each solver's «sent» view, «again» beside it); `read_aloud` does the
 * same on the phone in its own body. This module is the same rule for the rest, read in one
 * place so the runner, not four bodies, decides what is shown.
 */

/** The templates whose hand-in may wait for a reader, and which the runner reopens on it. */
export const HANDED_IN_TEMPLATES: ReadonlySet<string> = new Set([
  'writing_task',
  'error_correction',
  'translate_to_target',
  'translate_from_target',
  'short_answer',
]);

/** How many of the newest attempts are looked through — the web BFF's page. */
export const HANDED_IN_LOOKBACK = 10;

/** Statuses of an attempt that was handed in — the web BFF's `GET attempts` list. */
const FINISHED: ReadonlySet<string> = new Set(['SCORED', 'ROUTED_FOR_REVIEW', 'RETURNED', 'NO_REVIEWER']);

/**
 * The hand-in to reopen on, or `null` for a fresh attempt.
 *
 * The newest finished attempt, skipping any opened since (the web opens one on every visit, and
 * an empty one says nothing about the work). `short_answer` is checked on the spot unless it
 * went to a reader, so for it only work that did — waiting, unread, or already answered by one —
 * is reopened; a set scored on the spot is played again from the top, as on the web.
 */
export function handedInAttempt(templateCode: string, rows: readonly AttemptRow[]): AttemptRow | null {
  if (!HANDED_IN_TEMPLATES.has(templateCode)) return null;
  const last = rows.find(row => FINISHED.has(row.status));
  if (!last) return null;
  if (last.templateCode && last.templateCode !== templateCode) return null;
  if (templateCode === 'short_answer') {
    const read =
      last.status === 'ROUTED_FOR_REVIEW' ||
      last.status === 'NO_REVIEWER' ||
      last.status === 'RETURNED' ||
      last.reviewedBy != null;
    if (!read) return null;
  }
  return last;
}

/** Whose verdict closed it — a model's, a teacher's, or the key's on the spot. */
export type HandedInState =
  | { kind: 'waitingTeacher'; aiFirst: boolean }
  | { kind: 'waitingAi' }
  /** Kept on the phone, not handed in yet — who will read it is not known. */
  | { kind: 'onPhone' }
  | { kind: 'unread' }
  | { kind: 'reviewed'; by: 'teacher' | 'ai'; passed: boolean }
  /** Matched the key and passed without a reader (`error_correction`, `translate_*`). */
  | { kind: 'autoPassed' };

export function handedInState(row: AttemptRow, onPhone = false): HandedInState {
  if (row.status === 'ROUTED_FOR_REVIEW') {
    if (onPhone) return { kind: 'onPhone' };
    return row.schoolId === null ? { kind: 'waitingAi' } : { kind: 'waitingTeacher', aiFirst: row.aiFirst === true };
  }
  if (row.status === 'NO_REVIEWER') return { kind: 'unread' };
  if (row.reviewedBy === 'ai' || row.reviewedBy === 'teacher') {
    return { kind: 'reviewed', by: row.reviewedBy, passed: row.status === 'SCORED' && row.passed !== false };
  }
  if (row.status === 'RETURNED') return { kind: 'reviewed', by: 'teacher', passed: false };
  return { kind: 'autoPassed' };
}

/**
 * The verdict the runner and the set's results hold for a reopened hand-in — what `submit`
 * would have answered, or the reader's verdict once there is one. Work still waiting is
 * `requiresReview`, never passed (the results must not call it «counted», OQ-110).
 */
export function handedInVerdictOf(row: AttemptRow, onPhone = false): SubmitAttemptResponse {
  const state = handedInState(row, onPhone);
  const base = { attemptId: row.id, score: null, feedback: { summary: '' } };
  switch (state.kind) {
    case 'waitingTeacher':
      return { ...base, correct: false, requiresReview: true, reviewer: 'teacher', aiFirst: state.aiFirst };
    case 'waitingAi':
      return { ...base, correct: false, requiresReview: true, reviewer: 'ai' };
    case 'onPhone':
      return { ...base, correct: false, requiresReview: true, onPhone: true };
    case 'unread':
      return { ...base, correct: false, requiresReview: true, reviewer: 'none' };
    case 'reviewed':
      return { ...base, correct: state.passed, passed: state.passed, requiresReview: false };
    case 'autoPassed':
      return { ...base, correct: true, passed: true, requiresReview: false };
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Whether «Again» is offered under a reopened hand-in — the web's rule per template:
 * `error_correction` / `translate_*` unless the author allows one attempt (`flow.attempts:
 * 'once'`); `writing_task` only to rewrite work a reader failed, and never under `revision:
 * 'once'`; `short_answer` always.
 */
export function againAllowed(templateCode: string, content: unknown, row: AttemptRow): boolean {
  switch (templateCode) {
    case 'error_correction':
    case 'translate_to_target':
    case 'translate_from_target':
      return asRecord(asRecord(content).flow).attempts !== 'once';
    case 'writing_task': {
      const state = handedInState(row);
      if (state.kind !== 'reviewed' || state.passed) return false;
      const revision = readWritingTaskContent(content)?.settings.revision ?? 'return';
      return revision !== 'once';
    }
    case 'short_answer':
      return true;
    default:
      return false;
  }
}

/** One piece of the work as it was sent: what it answered (when there is a prompt) and the answer. */
export interface HandedInLine {
  key: string;
  prompt: string | null;
  text: string;
}

/** A sentence of `error_correction` with the learner's edits applied — the kernel's slots. */
export function correctedSentence(words: readonly string[], edits: Partial<StudentEdits> | undefined): string {
  const fix = asRecord(edits?.fix) as Record<string, unknown>;
  const ins = asRecord(edits?.ins) as Record<string, unknown>;
  const out: string[] = [];
  for (let slot = 0; slot <= words.length; slot += 1) {
    const inserted = ins[slot];
    if (typeof inserted === 'string' && inserted.trim() !== '') out.push(inserted.trim());
    if (slot === words.length) break;
    const fixed = fix[slot];
    if (typeof fixed === 'string') {
      if (fixed.trim() !== '') out.push(fixed.trim());
    } else {
      out.push(words[slot]);
    }
  }
  return out.join(' ');
}

/**
 * The submitted answer as text to read back, per template. Read leniently: a shape this
 * cannot read gives no lines, and the card still says the work was sent and how it was judged.
 */
export function handedInLines(
  templateCode: string,
  content: unknown,
  submittedAnswer: unknown,
): HandedInLine[] {
  const answer = asRecord(submittedAnswer);
  switch (templateCode) {
    case 'writing_task': {
      const text = typeof answer.text === 'string' ? answer.text.trim() : '';
      return text === '' ? [] : [{ key: 'text', prompt: null, text }];
    }
    case 'error_correction': {
      const items = asRecord(answer.items);
      return readEcTask(content, null).items
        .filter(item => item.id in items)
        .map(item => ({
          key: item.id,
          prompt: item.wrong,
          text: correctedSentence(item.words, items[item.id] as Partial<StudentEdits>),
        }));
    }
    case 'translate_to_target':
    case 'translate_from_target': {
      const sent = Array.isArray(submittedAnswer) ? submittedAnswer : [];
      const texts = new Map<string, string>();
      for (const raw of sent) {
        const entry = asRecord(raw);
        if (typeof entry.itemId === 'string' && typeof entry.text === 'string') texts.set(entry.itemId, entry.text);
      }
      return readTranslateTask(content, templateCode)
        .items.filter(item => texts.has(item.id))
        .map(item => ({ key: item.id, prompt: item.source, text: texts.get(item.id)! }));
    }
    case 'short_answer': {
      // The old form is one answer to one question.
      if (typeof answer.text === 'string') {
        const prompt = asRecord(content).question;
        return [{ key: 'text', prompt: typeof prompt === 'string' ? prompt : null, text: answer.text }];
      }
      const answers = Array.isArray(answer.answers) ? answer.answers : [];
      const texts = new Map<string, string>();
      for (const raw of answers) {
        const entry = asRecord(raw);
        if (typeof entry.questionId === 'string' && typeof entry.text === 'string') {
          texts.set(entry.questionId, entry.text);
        }
      }
      const questions = readShortAnswerSet(content)?.questions ?? [];
      return questions
        .filter(q => texts.has(q.id))
        .map(q => ({ key: q.id, prompt: q.prompt, text: texts.get(q.id)! }));
    }
    default:
      return [];
  }
}
