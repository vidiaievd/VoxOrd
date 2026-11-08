import type { SessionBudget, SessionStep, StepEvent } from '../../api/soundSession';

/** `nb:kj` → `kj`. */
export const familyOf = (atomId: string): string => atomId.split(':')[1] ?? atomId;

/** A sound id as the web writes it in a pill: the same check the engine reads (`nb:` + key). */
export const isSoundAtomId = (v: string): boolean => /^[a-z]{2}:[a-z0-9_]+$/.test(v);

/** Warn only when the learner pays, the limit is measured and the rest is under the estimate. */
export function lowBudget(b: SessionBudget | null): b is SessionBudget {
  return (
    b !== null &&
    b.payer === 'learner' &&
    b.metered &&
    b.remainingCredits !== null &&
    b.estimatedCredits !== null &&
    b.remainingCredits < b.estimatedCredits
  );
}

export type PromptKey = 'sayWord' | 'sayPair' | 'sayPhrase';

/** What the learner is asked to say, and the text to show. */
export function promptOf(step: SessionStep): { key: PromptKey; target: string } {
  if (step.phase === 'diagnostic') return { key: 'sayWord', target: step.word };
  const e = step.element;
  if (e.kind === 'word') return { key: 'sayWord', target: e.word };
  if (e.kind === 'pair') return { key: 'sayPair', target: e.words.join('  /  ') };
  return { key: 'sayPhrase', target: e.text };
}

/** Words and pairs are said inside the reference frame; a phrase is its own line. */
export const isFramed = (step: SessionStep): boolean =>
  step.phase === 'diagnostic' || step.element.kind !== 'phrase';

/** The word of a pair being said now, to tell the learner which half is up. */
export const pairNow = (step: SessionStep): string | null =>
  step.phase === 'drill' && step.element.kind === 'pair' ? step.say : null;

export type EventLine =
  | 'sound_failed'
  | 'sound_passed'
  | 'diagnostic_done'
  | 'element_passed'
  | 'side_passed';

const ORDER: readonly EventLine[] = [
  'sound_failed',
  'sound_passed',
  'diagnostic_done',
  'element_passed',
  'side_passed',
];

/** One line is enough: the strongest news first. */
export function eventLine(events: readonly StepEvent[]): EventLine | null {
  return ORDER.find(k => events.some(e => e.kind === k)) ?? null;
}

/** The toneme verdicts the screen has words for; anything else is not shown. */
export const toneKeyOf = (
  verdict: string | undefined,
): 'like_reference' | 'other_tone' | 'unsure' | null =>
  verdict === 'like_reference' || verdict === 'other_tone' || verdict === 'unsure' ? verdict : null;
