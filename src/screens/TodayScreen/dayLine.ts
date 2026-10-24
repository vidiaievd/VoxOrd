/** `t` from `useTranslation`, or `translateIn` bound to a language. */
export type Translate = (path: string, vars?: Record<string, string | number>) => string;

export interface DayLineInput {
  offline: boolean;
  hasCourses: boolean;
  /** Cards due now. */
  dueCount: number;
  /** The start of the learner's next class, if any is known. */
  nextClassAt: Date | null;
  now: Date;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** A class this many days ahead or fewer is near enough for the day line to name its day. */
const SOON_DAYS = 7;

/** Whole calendar days from `now` to `at`, in local time: 0 today, 1 tomorrow. */
function calendarDaysUntil(at: Date, now: Date): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day(at) - day(now)) / 86_400_000);
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The third header line (Home spec §6.2, block 1; the web's `HomeGreeting`): it names only
 * what is actually on, and with nothing due and no class it stays a plain question rather
 * than manufacturing urgency.
 */
export function buildDayLine(input: DayLineInput, t: Translate): string {
  const { offline, hasCourses, dueCount, nextClassAt, now } = input;
  if (offline) return t('today.dayLine.offline');
  if (!hasCourses) return t('today.dayLine.welcome');

  const days = nextClassAt ? calendarDaysUntil(nextClassAt, now) : null;
  const classToday = days === 0;
  const classSoon = days !== null && days > 0 && days <= SOON_DAYS;
  const due = dueCount > 0;

  if (classToday && due) return t('today.dayLine.reviewsAndClassToday', { count: dueCount });
  if (classSoon && due) {
    const weekday = t(`today.weekdayOn.${WEEKDAY_KEYS[nextClassAt!.getDay()]}`);
    return t('today.dayLine.reviewsAndClassOn', { count: dueCount, weekday });
  }
  if (classToday) return t('today.dayLine.classToday', { time: hhmm(nextClassAt!) });
  if (due) return t('today.dayLine.reviewsOnly', { count: dueCount });
  return t('today.subtitle');
}
