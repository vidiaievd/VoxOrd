/** Pure arithmetic of the Practice tab (Practice §6.2, §6.4) — no screens, no network. */

/** How long one card is assumed to take, for «~N min». */
export const SECONDS_PER_CARD = 20;

/** Minutes a queue of `count` cards takes, rounded up; at least one. */
export function estimateMinutes(count: number): number {
  return Math.max(1, Math.ceil((Math.max(0, count) * SECONDS_PER_CARD) / 60));
}

export type SourceKey = 'courseWords' | 'myWords' | 'rules' | 'exercises';

export interface SourceCounts {
  courseWords?: number | null;
  myWords?: number | null;
  rules?: number | null;
  exercises?: number | null;
}

const SOURCE_ORDER: SourceKey[] = ['courseWords', 'myWords', 'rules', 'exercises'];

/**
 * The parts of «12 words from courses · 3 from My words · 2 rules». A part with no data
 * (null/undefined) or nothing in it is left out, never printed as a zero — a gap in what the
 * phone knows must not read as an empty queue.
 */
export function sourceBreakdown(counts: SourceCounts): { key: SourceKey; count: number }[] {
  const parts: { key: SourceKey; count: number }[] = [];
  for (const key of SOURCE_ORDER) {
    const count = counts[key];
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      parts.push({ key, count: Math.floor(count) });
    }
  }
  return parts;
}

export interface ForecastDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export type ForecastPart =
  | { when: 'tomorrow'; count: number }
  /** `weekday` is `Date#getDay()`: 0 = Sunday. */
  | { when: 'weekday'; weekday: number; count: number };

function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / 86_400_000);
}

function localDayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/**
 * The two nearest days after today that have something due, as «tomorrow 9» / «on Wednesday
 * 21». Empty without a forecast, so the line is hidden rather than invented.
 */
export function forecastLine(
  forecast: readonly ForecastDay[] | null | undefined,
  now: Date,
): ForecastPart[] {
  if (!forecast) return [];
  const today = localDayNumber(now);
  return forecast
    .map(d => ({ n: dayNumber(d.date), count: d.count, date: d.date }))
    .filter(d => d.n !== null && d.n > today && d.count > 0)
    .sort((a, b) => (a.n as number) - (b.n as number))
    .slice(0, 2)
    .map<ForecastPart>(d =>
      d.n === today + 1
        ? { when: 'tomorrow', count: d.count }
        : {
            when: 'weekday',
            weekday: new Date((d.n as number) * 86_400_000).getUTCDay(),
            count: d.count,
          },
    );
}
