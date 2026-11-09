import type { DueGrammarRule } from '../api/grammarReview';

/*
 * The phone's side of «Grammar to review» (Practice 6a, 6l; plan 05 step 7). Which rules are
 * due is decided by learning-service (`api/grammarReview.ts`); this only merges the courses'
 * answers, numbers the units and does the arithmetic the screens print.
 */

/** Rows on the Practice root (Practice §6.3). */
export const GRAMMAR_ROWS = 3;

/** How long one exercise of a rule's review is assumed to take, for «~N min». */
export const SECONDS_PER_EXERCISE = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GrammarDueRowData {
  ruleId: string;
  courseId: string;
  unitId: string;
  /** 1-based, by the unit's position in the course. */
  unitNumber: number;
  masteryPercent: number;
  /** Whole days since the last practice; null when the rule was never practised. */
  idleDays: number | null;
}

export interface CourseGrammarDue {
  courseId: string;
  rules: DueGrammarRule[];
  /** The course's unit ids in course order. */
  unitIds: string[];
}

/** Whole days between `at` and `now`; null for no date. A date in the future reads as today. */
export function idleDays(at: string | null, now: Date): number | null {
  if (at === null) return null;
  const ms = now.getTime() - new Date(at).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / DAY_MS));
}

/**
 * The rows of every course, lowest mastery first, at most `limit`. A rule outside the
 * course's units (directly under the course, or in a unit the phone does not see) is left
 * out: both its row and its review need a unit to name and to run in.
 */
export function pickGrammarRows(
  courses: readonly CourseGrammarDue[],
  now: Date,
  limit = GRAMMAR_ROWS,
): GrammarDueRowData[] {
  const rows: GrammarDueRowData[] = [];
  for (const course of courses) {
    for (const rule of course.rules) {
      const index = rule.moduleId === null ? -1 : course.unitIds.indexOf(rule.moduleId);
      if (index < 0 || rule.moduleId === null) continue;
      rows.push({
        ruleId: rule.grammarRuleId,
        courseId: course.courseId,
        unitId: rule.moduleId,
        unitNumber: index + 1,
        masteryPercent: rule.masteryPercent,
        idleDays: idleDays(rule.lastPracticedAt, now),
      });
    }
  }
  return rows.sort((a, b) => a.masteryPercent - b.masteryPercent).slice(0, limit);
}

/** Minutes a review of `count` exercises takes, rounded up; at least one. */
export function reviewMinutes(count: number): number {
  return Math.max(1, Math.ceil((Math.max(0, count) * SECONDS_PER_EXERCISE) / 60));
}
