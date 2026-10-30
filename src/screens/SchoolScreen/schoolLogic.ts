import type { NextClass } from '../../api/nextClass';
import type { SchoolGroup } from '../../api/schools';

/** The courses a group opens, main one first, each once; a course without a known title is left out. */
export function schoolCourses(
  group: SchoolGroup,
): { courseId: string; title: string }[] {
  const seen = new Set<string>();
  const out: { courseId: string; title: string }[] = [];
  for (const m of [group.mainCourse, ...group.materials]) {
    if (!m || !m.courseName || seen.has(m.courseId)) continue;
    seen.add(m.courseId);
    out.push({ courseId: m.courseId, title: m.courseName });
  }
  return out;
}

/**
 * «Mon, 12 Oct · 18:00–19:30» for the class row. `date` is the school's calendar day, so it
 * is read as a local date, never shifted through UTC.
 */
export function classLabel(
  c: Pick<NextClass, 'date' | 'startTime' | 'endTime' | 'room'>,
  language: string,
): { when: string; room: string | null } {
  const [y, m, d] = c.date.slice(0, 10).split('-').map(Number);
  let day: string;
  try {
    day = new Date(y, m - 1, d).toLocaleDateString(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    day = c.date.slice(0, 10);
  }
  const room = c.room?.trim() || null;
  return {
    when: `${day} · ${c.startTime.slice(0, 5)}–${c.endTime.slice(0, 5)}`,
    room,
  };
}
