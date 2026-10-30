import { contents, item } from './__fixtures__/unitContents';
import { openContentItem } from './openContentItem';

const place = { unitId: 'u0', courseId: 'course' };

const text = (id: string, status: Parameters<typeof item>[1] = 'available') => ({
  ...item(id, status, 'lesson'),
  lessonKind: 'text' as const,
});

describe('openContentItem', () => {
  it('a lesson opens the reader with the exercises of its section', () => {
    const t = text('t');
    const c = contents([[t, item('a', 'available'), item('b', 'available')], [item('z', 'available')]]);
    expect(openContentItem(t, c, place)).toEqual({
      name: 'LessonReader',
      lessonId: 'c-t',
      unitId: 'u0',
      courseId: 'course',
      exerciseIds: ['c-a', 'c-b'],
      alreadyRead: false,
    });
  });

  it('a lesson read before is marked so', () => {
    const t = text('t', 'completed');
    const target = openContentItem(t, contents([[t]]), place);
    expect(target).toMatchObject({ name: 'LessonReader', alreadyRead: true, exerciseIds: [] });
  });

  it('an exercise opens the whole set of the unit at its place, ungrouped ones last', () => {
    const b = item('b', 'in_progress');
    const c = contents(
      [[item('a', 'completed'), item('v', 'available', 'vocabulary_list')], [b]],
      [item('u', 'available')],
    );
    expect(openContentItem(b, c, place)).toEqual({
      name: 'ExerciseRunner',
      exerciseIds: ['c-a', 'c-b', 'c-u'],
      startIndex: 1,
      unitId: 'u0',
      courseId: 'course',
    });
  });

  it('an exercise in a unit with a text carries that text as its source lesson', () => {
    const x = item('x', 'available');
    const c = contents([[text('t'), x]]);
    expect(openContentItem(x, c, place)).toMatchObject({
      name: 'ExerciseRunner',
      startIndex: 0,
      sourceLessonId: 'c-t',
    });
  });

  it('an exercise missing from the set starts at the beginning', () => {
    const stray = item('stray', 'available');
    const c = contents([[item('a', 'available')]]);
    expect(openContentItem(stray, c, place)).toMatchObject({ startIndex: 0 });
  });

  it('a word list and a grammar rule open their own readers', () => {
    const v = item('v', 'available', 'vocabulary_list');
    const g = item('g', 'available', 'grammar_rule');
    const c = contents([[v, g]]);
    expect(openContentItem(v, c, place)).toEqual({
      name: 'VocabularyList',
      listId: 'c-v',
      unitId: 'u0',
      courseId: 'course',
    });
    expect(openContentItem(g, c, place)).toEqual({
      name: 'GrammarRuleReader',
      ruleId: 'c-g',
      unitId: 'u0',
      courseId: 'course',
    });
  });

  it('a container opens nothing', () => {
    const k = item('k', 'available', 'container');
    expect(openContentItem(k, contents([[k]]), place)).toBeNull();
  });
});
