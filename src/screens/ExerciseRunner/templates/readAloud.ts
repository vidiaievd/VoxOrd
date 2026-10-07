/**
 * Pure logic for `read_aloud` on the phone — plan 70, phase 10.
 *
 * `content` is the kernel's student projection (`read-aloud/projection.ts`, applied by
 * content-service before `/display` and the attempt start answer): per prompt its label, the
 * three numbers and the material of the current mode only; the recording rules; the three
 * settings that change what the runner draws; the rubric only under `showRubric: 'always'`.
 * The listening note, the focus words, the pass mark and the AI stage never leave the server
 * (RA-M5, RA-M6).
 *
 * Nothing here judges speech. Every submission goes to a teacher and comes back
 * `requiresReview`. What this module decides is where the screen opens — recording, waiting
 * for the teacher, or after a verdict — and which takes of a draft may be offered again. The
 * recorder's own rules are the kernel's (`lib/readAloud`).
 *
 * The teacher's verdict is read back from the attempt and drawn as the web's graded card
 * (decided 07.10 — deviation 20 is withdrawn for this type): the verdict and the marks are the
 * server's, and the points are added up by the kernel's own function (`scorePrompts`).
 */
import type { AttemptRow, SubmitAttemptResponse } from '../../../api/exercises';
import type { MediaAsset } from '../../../api/media';
import {
  DEFAULT_RECORDING,
  isMode,
  RA_MAX_TAKES,
  readDraft,
  readSubmission,
  type Draft,
  type Mode,
  type Recording,
  type RevisionPolicy,
  type ShowModelPolicy,
  type ShowRubricPolicy,
  type SubmittedRecording,
} from '../../../lib/readAloud';

export const TEMPLATE_CODE = 'read_aloud';

export interface ReadAloudPrompt {
  id: string;
  label: string;
  minSeconds: number;
  maxSeconds: number;
  prepSeconds: number;
  /** `read`. */
  text?: string;
  /** `monologue`, when a picture is attached. */
  image?: { assetId: string; caption: string; alt: string };
  /** `monologue`, the points that say something. */
  plan?: { id: string; text: string; required: boolean }[];
  /** `dialogue`. */
  turn?: { situation: string; partner: string };
}

export interface ReadAloudCriterion {
  id: string;
  name: string;
  desc: string;
  levels: [string, string, string, string];
}

/** `ExerciseDisplay.content` for this template — the kernel's `StudentProjection`. */
export interface ReadAloudContent {
  title: string;
  instruction: string;
  language: string;
  mode: Mode;
  prompts: ReadAloudPrompt[];
  recording: Recording;
  settings: {
    showRubric: ShowRubricPolicy;
    showModel: ShowModelPolicy;
    revision: RevisionPolicy;
  };
  /** Only under `showRubric: 'always'`, and only the criteria the student may see. */
  rubric?: ReadAloudCriterion[];
}

/**
 * Accept the exercise only if what arrived is the student projection — the web's
 * `readReadAloudProjection`, field for field.
 *
 * Any key-side field on the wire means the stored document reached the device — a server
 * older than plan 70 phases 4–5, or a route that reached for the authoring copy — and the
 * answer is to refuse, not to strip: a stripped document gives a runner that works and nothing
 * on any screen to say the key left.
 */
export function readReadAloudContent(value: unknown): ReadAloudContent | null {
  if (!isRecord(value)) return null;
  if ('expected' in value || 'expectedAnswers' in value || 'review' in value)
    return null;
  if (!isMode(value.mode) || !Array.isArray(value.prompts)) return null;

  const prompts: ReadAloudPrompt[] = [];
  for (const raw of value.prompts) {
    const prompt = readPrompt(raw);
    if (prompt === null) return null;
    prompts.push(prompt);
  }

  const s = isRecord(value.settings) ? value.settings : {};
  if ('passScore' in s) return null;
  const settings: ReadAloudContent['settings'] = {
    showRubric:
      s.showRubric === 'always' || s.showRubric === 'never'
        ? s.showRubric
        : 'afterGraded',
    showModel: s.showModel === 'never' ? 'never' : 'afterGraded',
    revision: s.revision === 'once' ? 'once' : 'return',
  };

  let rubric: ReadAloudCriterion[] | undefined;
  if (value.rubric !== undefined) {
    // Descriptors before the verdict only when the author asked for the rubric to be shown.
    if (settings.showRubric !== 'always' || !Array.isArray(value.rubric))
      return null;
    rubric = [];
    for (const raw of value.rubric) {
      const c = readCriterion(raw);
      if (c === null) return null;
      rubric.push(c);
    }
  }

  return {
    title: str(value.title),
    instruction: str(value.instruction),
    language: str(value.language),
    mode: value.mode,
    prompts,
    recording: readRecording(value.recording),
    settings,
    ...(rubric === undefined ? {} : { rubric }),
  };
}

function readPrompt(raw: unknown): ReadAloudPrompt | null {
  if (!isRecord(raw)) return null;
  if ('note' in raw || 'focus' in raw) return null;
  const { id } = raw;
  if (typeof id !== 'string' || id === '') return null;

  const min = seconds(raw.minSeconds);
  const max = seconds(raw.maxSeconds);
  const prep = seconds(raw.prepSeconds);
  if (min === null || max === null || prep === null || max <= 0) return null;

  const out: ReadAloudPrompt = {
    id,
    label: str(raw.label),
    minSeconds: min,
    maxSeconds: max,
    prepSeconds: prep,
  };
  if (typeof raw.text === 'string') out.text = raw.text;
  if (isRecord(raw.image) && typeof raw.image.assetId === 'string') {
    out.image = {
      assetId: raw.image.assetId,
      caption: str(raw.image.caption),
      alt: str(raw.image.alt),
    };
  }
  if (Array.isArray(raw.plan)) {
    out.plan = raw.plan.flatMap(p =>
      isRecord(p) && typeof p.id === 'string' && typeof p.text === 'string'
        ? [{ id: p.id, text: p.text, required: p.required === true }]
        : [],
    );
  }
  if (isRecord(raw.turn)) {
    out.turn = {
      situation: str(raw.turn.situation),
      partner: str(raw.turn.partner),
    };
  }
  return out;
}

function readCriterion(raw: unknown): ReadAloudCriterion | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  // A weight or a visibility flag is the authoring copy, not the student's.
  if ('weight' in raw || 'studentVisible' in raw) return null;
  const levels = Array.isArray(raw.levels) ? raw.levels : [];
  return {
    id: raw.id,
    name: str(raw.name),
    desc: str(raw.desc),
    levels: [0, 1, 2, 3].map(i => str(levels[i])) as [
      string,
      string,
      string,
      string,
    ],
  };
}

/** Field by field: a field the runner has no business with cannot ride in. */
function readRecording(raw: unknown): Recording {
  const r = isRecord(raw) ? raw : {};
  const takes = r.takes;
  const flag = (key: keyof Recording) =>
    typeof r[key] === 'boolean'
      ? (r[key] as boolean)
      : (DEFAULT_RECORDING[key] as boolean);
  return {
    takes:
      typeof takes === 'number' &&
      Number.isInteger(takes) &&
      takes >= 1 &&
      takes <= RA_MAX_TAKES
        ? takes
        : DEFAULT_RECORDING.takes,
    chooseBest: flag('chooseBest'),
    listenBack: flag('listenBack'),
    countdown: flag('countdown'),
    micCheck: flag('micCheck'),
    keepAllTakes: flag('keepAllTakes'),
  };
}

/* ── Where the screen opens ─────────────────────────────────────────────── */

/**
 * What this learner already has at this exercise, newest first as the engine lists it.
 *
 *   sent    work handed in and waiting (`ROUTED_FOR_REVIEW`) — nothing to record until the
 *           teacher answers;
 *   draft   takes uploaded onto the attempt in progress — the learner was mid-way (RA-R10);
 *   graded  a verdict — the last thing that happened; `redo` when the teacher sent the work
 *           back and the author allows another try;
 *   fresh   none of these.
 *
 * The order is the web solver's: takes on a draft outrank a verdict — after «Ta opp på nytt
 * og lever» the new attempt's takes are the work.
 */
export type Opening =
  | { stage: 'fresh' }
  | { stage: 'draft'; attemptId: string; draft: Draft }
  | { stage: 'sent'; attemptId: string; recordings: SubmittedRecording[] }
  | {
      stage: 'graded';
      attemptId: string;
      recordings: SubmittedRecording[];
      verdict: GradedVerdict;
      /** The teacher sent the work back and the author allows another try. */
      redo: boolean;
    };

/** What the teacher said, as the attempt carries it back to the learner. */
export interface GradedVerdict {
  passed: boolean | null;
  /** The rubric frozen when the work was queued; null on an attempt without one. */
  snapshot: unknown;
  /** `itemId:criterionId` → 0–3. */
  marks: unknown;
  decisions: ReviewDecision[];
  comment: string | null;
}

/** The teacher's word on one prompt (Q1-A): whether it passed, and what to work on. */
export interface ReviewDecision {
  itemId: string;
  approved: boolean;
  comment?: string;
}

export type Outcome = 'passed' | 'rewrite' | 'failed';

/**
 * The card's label: passed, to record again (`revision: 'return'`), or not passed for good
 * (`once`) — the web's `outcomeOf` (plan 50 §3.2 item 1, deviation 13). Two domain verdicts,
 * three labels.
 */
export function outcomeOf(passed: boolean | null, revision: string): Outcome {
  if (passed === true) return 'passed';
  return revision === 'once' ? 'failed' : 'rewrite';
}

/** The per-prompt decisions off the attempt; anything malformed is left out. */
export function readDecisions(value: unknown): ReviewDecision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ReviewDecision[] => {
    if (
      !isRecord(raw) ||
      typeof raw.itemId !== 'string' ||
      typeof raw.approved !== 'boolean'
    ) {
      return [];
    }
    return [
      {
        itemId: raw.itemId,
        approved: raw.approved,
        ...(typeof raw.comment === 'string' ? { comment: raw.comment } : {}),
      },
    ];
  });
}

const FINISHED = new Set(['ROUTED_FOR_REVIEW', 'SCORED', 'RETURNED']);

export function openingOf(
  rows: readonly AttemptRow[],
  revision: RevisionPolicy,
): Opening {
  const mine = rows.filter(r => r.templateCode === TEMPLATE_CODE);
  const last = mine.find(r => FINISHED.has(r.status));
  const open = mine.find(r => r.status === 'IN_PROGRESS');
  const handedIn = readSubmission(last?.submittedAnswer)?.recordings ?? [];

  if (last && last.status === 'ROUTED_FOR_REVIEW') {
    return { stage: 'sent', attemptId: last.id, recordings: handedIn };
  }
  if (open) {
    const draft = readDraft(open.draftAnswer);
    if (Object.keys(draft.takes).length > 0)
      return { stage: 'draft', attemptId: open.id, draft };
  }
  if (last) {
    return {
      stage: 'graded',
      attemptId: last.id,
      recordings: handedIn,
      verdict: {
        passed: typeof last.passed === 'boolean' ? last.passed : null,
        snapshot: last.rubricSnapshot ?? null,
        marks: last.rubricMarks ?? null,
        decisions: readDecisions(last.reviewDecisions),
        comment:
          typeof last.reviewComment === 'string' ? last.reviewComment : null,
      },
      redo:
        last.status === 'RETURNED' &&
        outcomeOf(last.passed ?? null, revision) === 'rewrite',
    };
  }
  return { stage: 'fresh' };
}

/**
 * The draft's takes that are this attempt's and still in storage, renumbered by place.
 *
 * A recording belongs to the attempt it was made for (Q2-A). A take whose asset is gone,
 * failed, or answers another attempt would be refused by the engine at hand-in, so it is
 * dropped here instead — the web solver's `verifiedDraft`, with the assets already fetched.
 */
export function verifiedDraft(
  draft: Draft,
  attemptId: string,
  assets: ReadonlyMap<string, MediaAsset | null>,
): Draft {
  const takes: Draft['takes'] = {};
  const chosen: Draft['chosen'] = {};
  for (const [itemId, own] of Object.entries(draft.takes)) {
    const kept = own.filter(take => {
      const asset = assets.get(take.assetId);
      if (!asset || asset.entityId !== attemptId) return false;
      return asset.status !== 'FAILED' && asset.status !== 'DELETED';
    });
    if (kept.length === 0) continue;
    takes[itemId] = kept.map((take, i) => ({ ...take, n: i + 1 }));
    const picked = own[draft.chosen[itemId] ?? -1];
    const at = picked === undefined ? -1 : kept.indexOf(picked);
    if (at >= 0) chosen[itemId] = at;
  }
  return { takes, chosen };
}

/* ── Hand-in ────────────────────────────────────────────────────────────── */

/** Refusals that mean the take itself is unusable — it goes back to the budget (decided 06.10). */
export const RETAKE_CODES: ReadonlySet<string> = new Set([
  'RA_RECORDING_NOT_FOUND',
  'RA_RECORDING_FAILED',
  'RA_RECORDING_LENGTH',
]);

export interface RecordingRefusal {
  code: string;
  itemIds: string[];
}

/** The engine's 422 `{ code: RA_RECORDING_*, itemIds }`, or null when the error is not one. */
export function recordingRefusal(
  status: number | null,
  body: unknown,
): RecordingRefusal | null {
  if (status !== 422 || !isRecord(body)) return null;
  const { code, itemIds } = body;
  if (typeof code !== 'string' || !code.startsWith('RA_RECORDING_'))
    return null;
  return {
    code,
    itemIds: Array.isArray(itemIds)
      ? itemIds.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

/**
 * The verdict of an attempt already with a teacher — what `submit` answered when it was handed
 * in, rebuilt for a runner that opens on it. The engine never scores a recording, so this is
 * the whole of what it said.
 */
export function handedInVerdict(attemptId: string): SubmitAttemptResponse {
  return {
    attemptId,
    correct: false,
    score: null,
    requiresReview: true,
    feedback: { summary: '' },
  };
}

/** A file name for the asset row: `p1-take-2.m4a`. */
export function recordingFilename(
  itemId: string,
  n: number,
  mimeType: string,
): string {
  const ext = mimeType.includes('webm')
    ? 'webm'
    : mimeType.includes('ogg')
    ? 'ogg'
    : 'm4a';
  return `${itemId}-take-${n}.${ext}`;
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
