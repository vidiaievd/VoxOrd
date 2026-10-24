import { FOCUSES, SKILLS, type Focus, type Skill } from '../kernel/skills/model';
import { ApiError, apiClient } from './client';
import { isRecord, isString } from './guards';
import { isServerOutOfReach } from './isNetworkError';

/* ─────────────────────────────────────────────────────────────────────────
 * What analytics knows the learner is weak at (mobile redesign 02, step 5) — the source of
 * «Worth working on» (block 11).
 *
 * analytics-service `GET /api/v1/analytics/mastery/me` (JWT, the learner from the token —
 * plan 02 step 4): the same profile the web reads from `/internal/mastery/:userId`; types as
 * the web's `features/mastery/types.ts`. Not `/api/v1/mastery/*` — that is learning-service's
 * per-course mastery (`api/mastery.ts`), a different thing.
 *
 * Validated whole, as on the web: this is a claim about a person, and a shape change upstream
 * must read as «we cannot say» (null), never as an empty profile, which is a different and
 * wrong claim.
 * ────────────────────────────────────────────────────────────────────── */

export type MasterySkill = Skill | 'unknown';
export type MasteryFocus = Focus | 'unknown';
export type WeaknessReason = 'forgets' | 'never-knew' | 'watch';

/** A cell the profile is willing to speak about: it cleared `minWeightedSample`. */
export interface MasteryVerdict {
  skill: MasterySkill;
  focus: MasteryFocus;
  successRateEwma: number;
  reason: WeaknessReason | null;
  meanStability: number | null;
  medianSecondsPerItem: number | null;
  attempts: number;
  weightedSample: number;
  lastAttemptAt: string;
}

/** A cell that was practised, but not enough for anything to be said about it. */
export interface MasteryUncertainCell {
  skill: MasterySkill;
  focus: MasteryFocus;
  status: 'insufficient_data';
  attempts: number;
  weightedSample: number;
  shortfall: number;
}

export interface MasteryProfile {
  userId: string;
  courseId: string | null;
  minWeightedSample: number;
  /** Weakest first. Only cells over the bar. */
  weakest: MasteryVerdict[];
  /** Attempted but unjudged, thinnest evidence first. */
  insufficient: MasteryUncertainCell[];
}

const PATH = '/api/v1/analytics/mastery/me';

const SKILL_VALUES: readonly string[] = [...SKILLS, 'unknown'];
const FOCUS_VALUES: readonly string[] = [...FOCUSES, 'unknown'];
const REASONS: readonly string[] = ['forgets', 'never-knew', 'watch'];

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return isNumber(value) ? value : undefined;
}

function isCell(raw: Record<string, unknown>): boolean {
  return (
    isString(raw.skill) &&
    SKILL_VALUES.includes(raw.skill) &&
    isString(raw.focus) &&
    FOCUS_VALUES.includes(raw.focus) &&
    isNumber(raw.attempts) &&
    isNumber(raw.weightedSample)
  );
}

function parseVerdict(raw: unknown): MasteryVerdict | null {
  if (!isRecord(raw) || !isCell(raw) || !isNumber(raw.successRateEwma) || !isString(raw.lastAttemptAt)) {
    return null;
  }
  // Absent reads as null, as the web's `.default(null)`; any other value is not a reason.
  const reason = raw.reason ?? null;
  if (reason !== null && !(isString(reason) && REASONS.includes(reason))) return null;
  const meanStability = numberOrNull(raw.meanStability);
  const medianSecondsPerItem = numberOrNull(raw.medianSecondsPerItem);
  if (meanStability === undefined || medianSecondsPerItem === undefined) return null;
  return {
    skill: raw.skill as MasterySkill,
    focus: raw.focus as MasteryFocus,
    successRateEwma: raw.successRateEwma,
    reason: reason as WeaknessReason | null,
    meanStability,
    medianSecondsPerItem,
    attempts: raw.attempts as number,
    weightedSample: raw.weightedSample as number,
    lastAttemptAt: raw.lastAttemptAt,
  };
}

function parseUncertain(raw: unknown): MasteryUncertainCell | null {
  if (!isRecord(raw) || !isCell(raw) || raw.status !== 'insufficient_data' || !isNumber(raw.shortfall)) {
    return null;
  }
  return {
    skill: raw.skill as MasterySkill,
    focus: raw.focus as MasteryFocus,
    status: 'insufficient_data',
    attempts: raw.attempts as number,
    weightedSample: raw.weightedSample as number,
    shortfall: raw.shortfall,
  };
}

/** The profile, or null when any part of it is not what the web would accept. */
export function parseMasteryProfile(raw: unknown): MasteryProfile | null {
  if (
    !isRecord(raw) ||
    !isString(raw.userId) ||
    (raw.courseId !== null && !isString(raw.courseId)) ||
    !isNumber(raw.minWeightedSample) ||
    !Array.isArray(raw.weakest) ||
    !Array.isArray(raw.insufficient)
  ) {
    return null;
  }
  const weakest = raw.weakest.map(parseVerdict);
  const insufficient = raw.insufficient.map(parseUncertain);
  if (weakest.includes(null) || insufficient.includes(null)) return null;
  return {
    userId: raw.userId,
    courseId: raw.courseId as string | null,
    minWeightedSample: raw.minWeightedSample,
    weakest: weakest as MasteryVerdict[],
    insufficient: insufficient as MasteryUncertainCell[],
  };
}

/**
 * The learner's profile, optionally for one course. Throws when analytics is out of reach,
 * so a cached profile stays; a refusal or a malformed answer is `null` — block 11 is silent.
 */
export async function getMasteryProfile(
  options: { courseId?: string; limit?: number } = {},
): Promise<MasteryProfile | null> {
  try {
    return parseMasteryProfile(
      await apiClient.get<unknown>(PATH, { query: { courseId: options.courseId, limit: options.limit } }),
    );
  } catch (e) {
    if (isServerOutOfReach(e) || !(e instanceof ApiError)) throw e;
    return null;
  }
}
