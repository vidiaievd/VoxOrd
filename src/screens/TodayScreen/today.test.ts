import type { UnitSummary } from '../../api/types';
import { nextUnit, pickCourseId } from './today';

const unit = (position: number, status: UnitSummary['status']): UnitSummary => ({
  id: `u${position}`,
  position,
  title: `Unit ${position}`,
  status,
  completedLessons: 0,
  totalLessons: 3,
});

describe('nextUnit', () => {
  it('opens the first unit that is open and not finished', () => {
    expect(nextUnit([unit(2, 'locked'), unit(0, 'done'), unit(1, 'active')])?.id).toBe('u1');
  });

  it('goes back to the last unit of a finished course', () => {
    expect(nextUnit([unit(0, 'done'), unit(1, 'done')])?.id).toBe('u1');
  });

  it('has nothing for a course with no units', () => {
    expect(nextUnit([])).toBeNull();
  });
});

describe('pickCourseId', () => {
  it('leads with the course opened last', () => {
    expect(pickCourseId(['a', 'b'], 'b')).toBe('b');
  });

  it('falls back to the first course when the last one is gone or unknown', () => {
    expect(pickCourseId(['a', 'b'], 'gone')).toBe('a');
    expect(pickCourseId(['a', 'b'], null)).toBe('a');
    expect(pickCourseId([], null)).toBeNull();
  });
});
