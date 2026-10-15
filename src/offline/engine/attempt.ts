/**
 * An attempt worked on the phone without the server (offline plan, B4), and its transitions.
 *
 * The state is the subset of exercise-engine's `Attempt` entity (`attempt.entity.ts`) that a
 * practice attempt of the templates graded offline touches, kept as plain JSON so it survives
 * the app being killed. The transitions are that entity's, ported by hand — the refusals with
 * the engine's own words, since the bodies show them — because the entity is tied to the
 * server's repositories and events. The verdicts themselves are the engine's code, copied
 * (`src/enginePort`); the order of these transitions is held to the engine by recorded
 * fixtures.
 */

export type LocalStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'SCORED' | 'ROUTED_FOR_REVIEW';

export interface AnsweredQuestion {
  questionId: string;
  text: string;
  verdict: 'pass' | 'partial' | 'fail';
  answeredAt: string;
}

export interface CheckedRow {
  rowId: string;
  attempts: number;
  placement: Record<string, string[]>;
  solved: boolean;
  revealed: boolean;
  checkedAt: string;
}

export interface PickedOption {
  questionId: string;
  picks: string[];
  eliminated: string[];
  correct: boolean;
  closed: boolean;
  revealed: boolean;
  pickedAt: string;
}

export interface LocalAttempt {
  /** `offline:<nonce>` — what tells every attempt call to stay on the phone. */
  id: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
  /** Offline is practice only: graded work is a submission to a teacher, made online. */
  checkMode: 'PRACTICE';
  status: LocalStatus;
  recheckCount: number;
  answersRevealed: boolean;
  selfChecksUsed: number;
  validationDetails: unknown;
  submittedAnswer: unknown;
  draftAnswer: unknown;
  answeredQuestions: AnsweredQuestion[];
  checkedRows: CheckedRow[];
  pickedOptions: PickedOption[];
  /** `minimal_pairs` only, which is never offline; kept for the facts the engine reads. */
  probeDraw: unknown;
  timeSpentSeconds: number;
  startedAt: string;
  /** The attempt the replay made on the server, once it has. */
  serverAttemptId: string | null;
}

/** A refusal, with the status and message the engine's controller would answer with. */
export class LocalRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422 | 429,
    message: string,
    readonly code: string | null = null,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'LocalRefusal';
  }
}

const transition = (message: string) => new LocalRefusal(422, message);

export const OFFLINE_ATTEMPT_PREFIX = 'offline:';

export function isLocalAttemptId(attemptId: string): boolean {
  return attemptId.startsWith(OFFLINE_ATTEMPT_PREFIX);
}

export function createLocalAttempt(props: {
  id: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
  now: Date;
}): LocalAttempt {
  return {
    id: props.id,
    userId: props.userId,
    exerciseId: props.exerciseId,
    templateCode: props.templateCode,
    targetLanguage: props.targetLanguage,
    checkMode: 'PRACTICE',
    status: 'IN_PROGRESS',
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    validationDetails: null,
    submittedAnswer: null,
    draftAnswer: null,
    answeredQuestions: [],
    checkedRows: [],
    pickedOptions: [],
    probeDraw: null,
    timeSpentSeconds: 0,
    startedAt: props.now.toISOString(),
    serverAttemptId: null,
  };
}

export function saveDraft(a: LocalAttempt, answer: unknown): void {
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot save a draft for attempt with status ${a.status}`);
  }
  a.draftAnswer = answer;
}

export function submit(a: LocalAttempt, answer: unknown): void {
  if (a.status === 'SUBMITTED') throw transition('Attempt has already been submitted');
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot submit attempt with status ${a.status}`);
  }
  a.submittedAnswer = answer;
  a.status = 'SUBMITTED';
}

/** The entity's `reopenForRecheck`: the check about to be made is number `recheckCount + 2`. */
export function reopenForRecheck(a: LocalAttempt, maxChecks?: number): void {
  if (a.answersRevealed) {
    throw transition('Cannot check again once the answers were revealed');
  }
  if (a.status !== 'SCORED') {
    throw transition(`Cannot check an attempt with status ${a.status} again`);
  }
  if (maxChecks !== undefined && a.recheckCount + 2 > maxChecks) {
    throw transition(`No checks left on this attempt (${maxChecks} allowed)`);
  }
  a.recheckCount += 1;
  a.status = 'IN_PROGRESS';
}

export function recordPartialCheck(a: LocalAttempt, validationDetails: unknown): void {
  if (a.status !== 'SUBMITTED') {
    throw transition(`Cannot record a partial check on attempt with status ${a.status}`);
  }
  a.validationDetails = validationDetails;
  a.status = 'IN_PROGRESS';
}

export function score(a: LocalAttempt, validationDetails: unknown): void {
  if (a.status !== 'SUBMITTED') throw transition(`Cannot score attempt with status ${a.status}`);
  a.validationDetails = validationDetails;
  a.status = 'SCORED';
}

/** Handed to a teacher, as the engine's `routeForReview` does: the attempt waits for a mark. */
export function routeForReview(a: LocalAttempt, validationDetails: unknown): void {
  if (a.status !== 'SUBMITTED') {
    throw transition(`Cannot route attempt with status ${a.status} for review`);
  }
  a.validationDetails = validationDetails;
  a.status = 'ROUTED_FOR_REVIEW';
}

export function revealAnswers(a: LocalAttempt): void {
  if (a.status === 'IN_PROGRESS') {
    throw transition(`Cannot reveal answers for an attempt with status ${a.status}`);
  }
  a.answersRevealed = true;
}

export function useSelfCheck(a: LocalAttempt, budget: number): void {
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot self-check an attempt with status ${a.status}`);
  }
  if (a.selfChecksUsed >= budget) {
    throw transition(
      budget === 0
        ? 'This exercise offers no self-checks'
        : `All ${budget} self-checks have been used`,
    );
  }
  a.selfChecksUsed += 1;
}

export function answerQuestion(
  a: LocalAttempt,
  props: { questionId: string; text: string; verdict: AnsweredQuestion['verdict'] },
  now: Date,
): void {
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot answer a question on an attempt with status ${a.status}`);
  }
  if (a.answeredQuestions.some(q => q.questionId === props.questionId)) {
    throw transition(`Question ${props.questionId} has already been answered`);
  }
  a.answeredQuestions.push({ ...props, answeredAt: now.toISOString() });
}

export function checkRow(
  a: LocalAttempt,
  props: { rowId: string; placement: Record<string, string[]>; solved: boolean; revealed: boolean },
  now: Date,
): CheckedRow {
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot check a sentence on an attempt with status ${a.status}`);
  }
  const existing = a.checkedRows.find(row => row.rowId === props.rowId);
  if (existing && (existing.solved || existing.revealed)) {
    throw transition(
      `Sentence ${props.rowId} is already ${existing.revealed ? 'revealed' : 'solved'}`,
    );
  }
  const checked: CheckedRow = {
    rowId: props.rowId,
    // A reveal is not an attempt at the sentence.
    attempts: (existing?.attempts ?? 0) + (props.revealed ? 0 : 1),
    placement: props.placement,
    solved: props.solved,
    revealed: props.revealed,
    checkedAt: now.toISOString(),
  };
  if (existing) a.checkedRows[a.checkedRows.indexOf(existing)] = checked;
  else a.checkedRows.push(checked);
  return checked;
}

export function pickOption(
  a: LocalAttempt,
  props: {
    questionId: string;
    optionId: string | null;
    correct: boolean;
    closed: boolean;
    revealed: boolean;
    eliminated?: readonly string[];
  },
  now: Date,
): PickedOption {
  if (a.status !== 'IN_PROGRESS') {
    throw transition(`Cannot answer a question on an attempt with status ${a.status}`);
  }
  const existing = a.pickedOptions.find(q => q.questionId === props.questionId);
  if (existing?.closed === true) {
    throw transition(
      `Question ${props.questionId} is already ${
        existing.revealed ? 'revealed' : existing.correct ? 'answered' : 'out of attempts'
      }`,
    );
  }
  const picked: PickedOption = {
    questionId: props.questionId,
    picks:
      props.revealed || props.optionId === null
        ? [...(existing?.picks ?? [])]
        : [...(existing?.picks ?? []), props.optionId],
    eliminated: [...(props.eliminated ?? existing?.eliminated ?? [])],
    correct: props.correct,
    closed: props.closed,
    revealed: props.revealed,
    pickedAt: now.toISOString(),
  };
  if (existing) a.pickedOptions[a.pickedOptions.indexOf(existing)] = picked;
  else a.pickedOptions.push(picked);
  return picked;
}
