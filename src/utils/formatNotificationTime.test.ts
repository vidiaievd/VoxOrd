import { formatNotificationTime as fmt } from './formatNotificationTime';

// Local-time constructors: the formatter works in the phone's calendar.
const now = new Date(2026, 9, 29, 12, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;

describe('formatNotificationTime', () => {
  it('says now under a minute, and for a clock slightly ahead', () => {
    expect(fmt(ago(30_000), now, 'en')).toBe('now');
    expect(fmt(ago(-5 * MIN), now, 'ru')).toBe('сейчас');
    expect(fmt(ago(30_000), now, 'uk')).toBe('зараз');
  });

  it('counts minutes up to 59, then hours', () => {
    expect(fmt(ago(10 * MIN), now, 'en')).toBe('10 min');
    expect(fmt(ago(59 * MIN), now, 'ru')).toBe('59 мин');
    expect(fmt(ago(59 * MIN), now, 'uk')).toBe('59 хв');
    expect(fmt(ago(60 * MIN), now, 'en')).toBe('1 h');
    expect(fmt(ago(2 * 60 * MIN + 5 * MIN), now, 'ru')).toBe('2 ч');
  });

  it('turns to yesterday at calendar midnight, not after 24 hours', () => {
    const justAfterMidnight = new Date(2026, 9, 29, 0, 10);
    expect(fmt(new Date(2026, 9, 28, 23, 50), justAfterMidnight, 'en')).toBe(
      '20 min',
    );
    expect(fmt(new Date(2026, 9, 28, 22, 0), justAfterMidnight, 'en')).toBe(
      'yesterday',
    );
    expect(fmt(new Date(2026, 9, 28, 9, 0), now, 'ru')).toBe('вчера');
    expect(fmt(new Date(2026, 9, 28, 9, 0), now, 'uk')).toBe('вчора');
  });

  it('writes the date within the year', () => {
    expect(fmt(new Date(2026, 9, 22, 10), now, 'en')).toBe('Oct 22');
    expect(fmt(new Date(2026, 9, 22, 10), now, 'ru')).toBe('22 окт');
    expect(fmt(new Date(2026, 9, 22, 10), now, 'uk')).toBe('22 жов');
  });

  it('adds the year across a year change', () => {
    const jan = new Date(2026, 0, 2, 9);
    expect(fmt(new Date(2026, 0, 1, 23, 0), jan, 'en')).toBe('yesterday');
    expect(fmt(new Date(2025, 11, 31, 23, 0), jan, 'en')).toBe('Dec 31, 2025');
    expect(fmt(new Date(2025, 9, 22, 10), now, 'en')).toBe('Oct 22, 2025');
    expect(fmt(new Date(2025, 9, 22, 10), now, 'ru')).toBe('22 окт 2025');
  });

  it('falls back to English for an unknown language and to empty for a bad date', () => {
    expect(fmt(ago(10 * MIN), now, 'de')).toBe('10 min');
    expect(fmt('not a date', now, 'en')).toBe('');
  });

  it('reads an ISO string', () => {
    expect(fmt(ago(3 * MIN).toISOString(), now, 'en')).toBe('3 min');
  });
});
