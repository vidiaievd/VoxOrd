import { translateIn } from '../../i18n';
import { buildDayLine, type DayLineInput } from './dayLine';

// Friday 23 October 2026, 09:00 local time.
const now = new Date(2026, 9, 23, 9, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

const base: DayLineInput = {
  offline: false,
  hasCourses: true,
  dueCount: 0,
  nextClassAt: null,
  now,
};

const line = (patch: Partial<DayLineInput>, language = 'ru') =>
  buildDayLine({ ...base, ...patch }, (path, vars) => translateIn(language, path, vars));

describe('buildDayLine', () => {
  it('offline wins over everything', () => {
    expect(line({ offline: true, hasCourses: false, dueCount: 5, nextClassAt: at(23, 18) })).toBe(
      'Работаем с тем, что сохранено на телефоне',
    );
  });

  it('welcomes a learner with no courses', () => {
    expect(line({ hasCourses: false, dueCount: 5 })).toBe('Добро пожаловать в VoxOrd');
  });

  it('names reviews and a class today together', () => {
    expect(line({ dueCount: 12, nextClassAt: at(23, 18) })).toBe(
      '12 карточек на повторение и занятие сегодня',
    );
  });

  it('names the weekday of a class within a week, as a time («в понедельник»)', () => {
    expect(line({ dueCount: 3, nextClassAt: at(26, 10) })).toBe(
      '3 карточки на повторение и занятие в понедельник',
    );
    expect(line({ dueCount: 1, nextClassAt: at(27, 10) })).toBe(
      '1 карточка на повторение и занятие во вторник',
    );
    expect(line({ dueCount: 2, nextClassAt: at(28, 10) }, 'uk')).toBe(
      '2 картки на повторення і заняття у середу',
    );
    expect(line({ dueCount: 1, nextClassAt: at(30, 10) }, 'en')).toBe(
      '1 card to review and a class on Friday',
    );
  });

  it('tomorrow just after midnight is still a day away, not today', () => {
    const late = new Date(2026, 9, 23, 23, 50);
    expect(line({ now: late, dueCount: 5, nextClassAt: at(24, 0, 10) })).toBe(
      '5 карточек на повторение и занятие в субботу',
    );
  });

  it('a class more than a week off does not make the line', () => {
    expect(line({ dueCount: 21, nextClassAt: at(31, 10) })).toBe('21 карточка на повторение');
  });

  it('a class today with nothing due gives its time', () => {
    expect(line({ nextClassAt: at(23, 8, 5) })).toBe('Сегодня занятие в 08:05');
    expect(line({ nextClassAt: at(23, 18, 30) }, 'uk')).toBe('Сьогодні заняття о 18:30');
  });

  it('a class later in the week with nothing due says nothing about it', () => {
    expect(line({ nextClassAt: at(26, 10) })).toBe('Что делаем сегодня?');
  });

  it('reviews alone, with the plural the count needs', () => {
    expect(line({ dueCount: 11 })).toBe('11 карточек на повторение');
    expect(line({ dueCount: 22 })).toBe('22 карточки на повторение');
    expect(line({ dueCount: 1 }, 'en')).toBe('1 card to review');
    expect(line({ dueCount: 4 }, 'en')).toBe('4 cards to review');
  });

  it('with nothing on it stays a plain question', () => {
    expect(line({})).toBe('Что делаем сегодня?');
    expect(line({}, 'en')).toBe('What are we doing today?');
  });
});
