import { contents, item, unit } from '../../lib/__fixtures__/unitContents';
import { resolveResume } from './nextItem';
import { resumeTarget } from './resumeTarget';

const resumeOf = (
  c: ReturnType<typeof contents>,
  opts: { downloaded?: boolean; offline?: boolean } = {},
) => {
  const r = resolveResume({
    units: [unit(0, 'active')],
    unitContents: { u0: c },
    downloadedUnitIds: new Set(opts.downloaded ? ['u0'] : []),
    offline: opts.offline ?? false,
  });
  if (!r) throw new Error('no resume');
  return r;
};

describe('resumeTarget', () => {
  it('an exercise opens the runner at its place in the unit set', () => {
    const c = contents([[item('a', 'completed'), item('b', 'in_progress'), item('c', 'available')]]);
    expect(resumeTarget(resumeOf(c), 'course', c)).toEqual({
      name: 'ExerciseRunner',
      exerciseIds: ['c-a', 'c-b', 'c-c'],
      startIndex: 1,
      unitId: 'u0',
      courseId: 'course',
    });
  });

  it('a lesson opens the reader with the exercises it leads into', () => {
    const c = contents([[item('t', 'available', 'lesson'), item('x', 'available')]]);
    const target = resumeTarget(resumeOf(c), 'course', c);
    expect(target).toMatchObject({
      name: 'LessonReader',
      lessonId: 'c-t',
      unitId: 'u0',
      courseId: 'course',
      alreadyRead: false,
    });
  });

  it('a word list and a grammar rule open their own readers', () => {
    const v = contents([[item('v', 'available', 'vocabulary_list')]]);
    expect(resumeTarget(resumeOf(v), 'course', v)).toEqual({
      name: 'VocabularyList',
      listId: 'c-v',
      unitId: 'u0',
      courseId: 'course',
    });
    const g = contents([[item('g', 'available', 'grammar_rule')]]);
    expect(resumeTarget(resumeOf(g), 'course', g)).toEqual({
      name: 'GrammarRuleReader',
      ruleId: 'c-g',
      unitId: 'u0',
      courseId: 'course',
    });
  });

  it('offline with the step not on the phone leads to the unit, which shows what is there', () => {
    const c = contents([[item('a', 'available')]]);
    expect(resumeTarget(resumeOf(c, { offline: true }), 'course', c)).toEqual({
      name: 'UnitContents',
      unitId: 'u0',
      courseId: 'course',
    });
  });

  it('offline with the unit on the phone opens the step', () => {
    const c = contents([[item('a', 'available')]]);
    const target = resumeTarget(resumeOf(c, { offline: true, downloaded: true }), 'course', c);
    expect(target.name).toBe('ExerciseRunner');
  });

  it('a unit without reachable contents, and a finished course', () => {
    expect(resumeTarget({ kind: 'unit', unit: unit(0, 'active') }, 'course', null)).toEqual({
      name: 'UnitContents',
      unitId: 'u0',
      courseId: 'course',
    });
    expect(resumeTarget({ kind: 'courseDone', unit: unit(0, 'done') }, 'course', null)).toEqual({
      name: 'CourseHome',
      courseId: 'course',
    });
  });
});
