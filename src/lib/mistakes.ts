/*
 * «Exercises with mistakes» on the Practice root (Practice §6.3, plan 05 step 8) — the
 * arithmetic only: no screens, no network, no storage.
 *
 * The server's list (exercise-engine `GET /attempts/mistakes`) is the truth once it has
 * heard of every answer. Until then the runner's own verdicts lie on top of it: a wrong
 * answer adds its exercise, a right one takes it off — offline as well as in the moments
 * before the list is asked for again. An entry comes off the top once a server answer
 * asked for after it has arrived and nothing for its exercise waits in the outbox.
 */

/** Rows on the Practice root. */
export const MISTAKE_ROWS = 3;

/** The score an answer needs to count as right — the engine's default pass mark. */
export const PASS_MARK = 70;

export interface ServerMistake {
  exerciseId: string;
  templateCode: string;
  courseId: string;
  unitId: string | null;
  title: string | null;
  /** ISO time of the failing answer. */
  attemptedAt: string;
}

/** One verdict the runner saw, kept until the server is known to have it too. */
export interface MistakeOverlayEntry {
  userId: string;
  exerciseId: string;
  wrong: boolean;
  /** ISO time of the verdict. */
  at: string;
  templateCode: string;
  courseId: string;
  unitId: string;
  title: string | null;
}

export interface CourseMistakes {
  courseId: string;
  /** Newest first, a page of them. */
  items: ServerMistake[];
  /** Every mistake of the course on the server, not only the page. */
  total: number;
  /** The course's unit ids in course order. */
  unitIds: string[];
}

export interface MistakeRowData {
  exerciseId: string;
  templateCode: string;
  courseId: string;
  unitId: string;
  /** 1-based, by the unit's position in the course. */
  unitNumber: number;
  title: string | null;
  attemptedAt: string;
}

export interface MergedMistakes {
  rows: MistakeRowData[];
  total: number;
}

/** Whether a verdict counts as wrong: under the pass mark, or not correct when unscored. */
export function isWrongVerdict(verdict: { correct: boolean; score: number | null }): boolean {
  return verdict.score === null ? !verdict.correct : verdict.score < PASS_MARK;
}

/** The latest entry per exercise — a learner may answer the same exercise twice offline. */
function latestPerExercise(entries: readonly MistakeOverlayEntry[]): Map<string, MistakeOverlayEntry> {
  const latest = new Map<string, MistakeOverlayEntry>();
  for (const entry of entries) {
    const seen = latest.get(entry.exerciseId);
    if (!seen || entry.at > seen.at) latest.set(entry.exerciseId, entry);
  }
  return latest;
}

/**
 * The server's lists of the learner's courses with the runner's verdicts on top. The total
 * is the server's, plus mistakes only the phone knows, minus the ones it saw corrected —
 * exact as long as a corrected exercise sits within the page the phone was given.
 */
export function mergeMistakes(
  courses: readonly CourseMistakes[],
  overlay: readonly MistakeOverlayEntry[],
  limit = MISTAKE_ROWS,
): MergedMistakes {
  const latest = latestPerExercise(overlay);
  const rows: MistakeRowData[] = [];
  let total = 0;

  for (const course of courses) {
    const unitNumber = (unitId: string | null) =>
      unitId === null ? 0 : course.unitIds.indexOf(unitId) + 1;
    const byExercise = new Map<string, ServerMistake>();
    for (const item of course.items) byExercise.set(item.exerciseId, item);
    let courseTotal = course.total;

    for (const entry of latest.values()) {
      if (entry.courseId !== course.courseId) continue;
      const known = byExercise.get(entry.exerciseId);
      if (known && known.attemptedAt >= entry.at) continue;
      if (entry.wrong) {
        if (!known) courseTotal += 1;
        byExercise.set(entry.exerciseId, {
          exerciseId: entry.exerciseId,
          templateCode: entry.templateCode,
          courseId: entry.courseId,
          unitId: entry.unitId,
          title: entry.title ?? known?.title ?? null,
          attemptedAt: entry.at,
        });
      } else if (known) {
        courseTotal -= 1;
        byExercise.delete(entry.exerciseId);
      }
    }

    total += Math.max(0, courseTotal);
    for (const item of byExercise.values()) {
      const number = unitNumber(item.unitId);
      // A row needs a unit to name and to open the exercise in.
      if (item.unitId === null || number === 0) continue;
      rows.push({ ...item, unitId: item.unitId, unitNumber: number });
    }
  }

  rows.sort((a, b) => (a.attemptedAt < b.attemptedAt ? 1 : a.attemptedAt > b.attemptedAt ? -1 : 0));
  return { rows: rows.slice(0, limit), total };
}

/**
 * The entries the server is known to have: given before a server answer that was asked for
 * after them, and with nothing for their exercise left in the outbox.
 */
export function settledEntries(
  entries: readonly MistakeOverlayEntry[],
  askedAt: string,
  pendingExerciseIds: ReadonlySet<string>,
): MistakeOverlayEntry[] {
  return entries.filter(entry => entry.at <= askedAt && !pendingExerciseIds.has(entry.exerciseId));
}
