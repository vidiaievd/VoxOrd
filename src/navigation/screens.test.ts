import { backTarget, tabOf, type Screen } from './screens';

describe('backTarget', () => {
  const unit = { unitId: 'u1', courseId: 'c1' };

  it('leaves the app only from Home', () => {
    expect(backTarget({ name: 'Home' })).toBeNull();
    expect(backTarget({ name: 'Courses' })).toEqual({ name: 'Home' });
    expect(backTarget({ name: 'Settings' })).toEqual({ name: 'Home' });
  });

  it('walks a course up one level at a time', () => {
    expect(backTarget({ name: 'CourseHome', courseId: 'c1' })).toEqual({ name: 'Courses' });
    expect(backTarget({ name: 'UnitContents', ...unit })).toEqual({
      name: 'CourseHome',
      courseId: 'c1',
    });
  });

  it('takes every screen inside a unit back to the unit', () => {
    const inside: Screen[] = [
      { name: 'LessonReader', lessonId: 'l1', ...unit },
      { name: 'VocabularyList', listId: 'v1', ...unit },
      { name: 'GrammarRuleReader', ruleId: 'r1', ...unit },
      { name: 'ExerciseRunner', exerciseIds: ['e1'], startIndex: 0, ...unit },
    ];
    for (const screen of inside) {
      expect(backTarget(screen)).toEqual({ name: 'UnitContents', ...unit });
    }
  });

  it('takes a review back to the course it was started from, or Home', () => {
    expect(backTarget({ name: 'ReviewSession', courseId: 'c1' })).toEqual({
      name: 'CourseHome',
      courseId: 'c1',
    });
    expect(backTarget({ name: 'ReviewSession' })).toEqual({ name: 'Home' });
  });
});

describe('tabOf', () => {
  it('keeps the Courses tab lit anywhere inside a course', () => {
    expect(tabOf({ name: 'UnitContents', unitId: 'u1', courseId: 'c1' })).toBe('Courses');
    expect(tabOf({ name: 'Home' })).toBe('Home');
    expect(tabOf({ name: 'ReviewSession' })).toBeNull();
  });
});
