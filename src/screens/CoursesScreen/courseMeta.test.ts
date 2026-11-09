import { courseProgress, pickCurrent, isSelfStudy } from './courseMeta';
import type { CourseListItem } from '../../api/courses';
import type { CourseHomePayload } from '../../api/types';

const course = (id: string, schoolId: string | null = null) =>
  ({ container: { id }, enrollment: { schoolId } }) as unknown as CourseListItem;

describe('pickCurrent', () => {
  const list = [course('a'), course('b')];
  it('takes the course opened last', () => expect(pickCurrent(list, 'b')?.container.id).toBe('b'));
  it('falls back to the first', () => {
    expect(pickCurrent(list, 'gone')?.container.id).toBe('a');
    expect(pickCurrent(list, null)?.container.id).toBe('a');
  });
  it('is null for no courses', () => expect(pickCurrent([], 'a')).toBeNull());
});

describe('courseProgress', () => {
  it('counts finished units', () => {
    const home = {
      units: [{ status: 'done' }, { status: 'active' }, { status: 'locked' }],
      progress: { percentComplete: 33.4 },
    } as unknown as CourseHomePayload;
    expect(courseProgress(home)).toEqual({ unitsDone: 1, unitsTotal: 3, pct: 33 });
  });
  it('is null before the course loads', () => expect(courseProgress(null)).toBeNull());
});

it('tells school courses from self-study', () => {
  expect(isSelfStudy(course('a'))).toBe(true);
  expect(isSelfStudy(course('a', 's1'))).toBe(false);
});
