import type { Feedback, FeedbackAtom, FeedbackWord, PrecheckRemaining, PrecheckResult } from '../../../api/precheck';

/**
 * The reading side of «Check» before hand-in (platform plan 84): which exercises have one,
 * and what a result says. Nothing here asks the server or draws anything.
 */

/**
 * Templates the engine rehearses (its `precheckCapability`, Q3): the two with a free reading
 * against the key, and the three only a model can read. Everything checked on the spot —
 * gaps, choices — is left out: a rehearsal there would hand over the answer. `read_aloud` is
 * rehearsed only when read from a text; a monologue has nothing to hold the reading against.
 */
export function precheckCapable(templateCode: string, readAloudMode?: string): boolean {
  switch (templateCode) {
    case 'translate_to_target':
    case 'translate_from_target':
    case 'error_correction':
    case 'writing_task':
    case 'short_answer':
      return true;
    case 'read_aloud':
      return readAloudMode === 'read';
    default:
      return false;
  }
}

/** What a finished check puts on screen besides (or instead of) the model's remarks. */
export type PrecheckNotice =
  /** The model answered: draw its remarks. */
  | { kind: 'remarks' }
  /** Nothing to draw but a line: the key settled it, a limit was hit, the model failed. */
  | { kind: 'line'; key: PrecheckLine }
  /** Only the free half ran, and this school's learners do not ask a model. */
  | { kind: 'none' };

export type PrecheckLine =
  | 'keySettles'
  | 'exerciseLimit'
  | 'learnerLimit'
  | 'poolEmpty'
  | 'emptyAnswer'
  | 'notReady'
  | 'sentenceLimit'
  | 'inaudible'
  | 'failed';

export function noticeOf(result: PrecheckResult): PrecheckNotice {
  const ai = result.ai;
  switch (ai.status) {
    case 'ok':
      return result.feedback !== null || result.reading !== null
        ? { kind: 'remarks' }
        : { kind: 'line', key: 'failed' };
    case 'failed':
      return {
        kind: 'line',
        key:
          ai.errorCode === 'recording_not_ready' || ai.errorCode === 'recording_missing'
            ? 'notReady'
            : ai.errorCode === 'recording_inaudible'
            ? 'inaudible'
            : 'failed',
      };
    case 'refused':
      if (ai.reason === 'exercise_limit') return { kind: 'line', key: 'exerciseLimit' };
      if (ai.reason === 'learner_limit') return { kind: 'line', key: 'learnerLimit' };
      if (ai.reason === 'pool_empty') return { kind: 'line', key: 'poolEmpty' };
      if (ai.reason === 'unaskable') return { kind: 'line', key: 'emptyAnswer' };
      if (ai.reason === 'attempt_limit') return { kind: 'line', key: 'sentenceLimit' };
      return { kind: 'line', key: 'failed' };
    case 'not_asked':
      return ai.reason === 'key_settles' ? { kind: 'line', key: 'keySettles' } : { kind: 'none' };
  }
}

/** Another check of this exercise is worth offering: the limit is not known to be spent. */
export function mayAskAgain(remaining: PrecheckRemaining | null): boolean {
  return remaining === null || remaining.exercise === null || remaining.exercise > 0;
}

/**
 * «About N checks left» — the smaller of the exercise's and the month's, since either ends the
 * asking. `null` when neither is limited (or none was read): then nothing is promised.
 */
export function checksLeft(remaining: PrecheckRemaining | null): number | null {
  if (remaining === null) return null;
  const counts = [remaining.exercise, remaining.learnerChecksApprox].filter(
    (n): n is number => n !== null,
  );
  return counts.length === 0 ? null : Math.min(...counts);
}

export type AccuracyBand = 'good' | 'fair' | 'low';

/** Colour bands of a word's score; the provider's own scale is 0–100. */
export function accuracyBand(accuracy: number): AccuracyBand {
  return accuracy >= 80 ? 'good' : accuracy >= 50 ? 'fair' : 'low';
}

export interface PassageWords {
  passageIndex: number | null;
  words: FeedbackWord[];
}

/** The words heard, grouped by the passage they were read in, in the order heard. */
export function wordsByPassage(feedback: Feedback): PassageWords[] {
  const groups: PassageWords[] = [];
  for (const word of feedback.words) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.passageIndex === word.passageIndex) last.words.push(word);
    else groups.push({ passageIndex: word.passageIndex, words: [word] });
  }
  return groups;
}

/**
 * The rules the remarks point at, once each in the order first named (plan 85, step 7). Three
 * remarks on one rule are one rule to revisit.
 */
export function rulesToRevisit(feedback: Feedback): FeedbackAtom[] {
  const seen = new Set<string>();
  const rules: FeedbackAtom[] = [];
  for (const item of feedback.items) {
    if (item.atom === null || seen.has(item.atom.atomId)) continue;
    seen.add(item.atom.atomId);
    rules.push(item.atom);
  }
  return rules;
}
