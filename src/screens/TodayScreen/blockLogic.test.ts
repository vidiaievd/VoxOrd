import type { MasteryVerdict } from '../../api/masteryProfile';
import type { StudentSchool } from '../../api/schools';
import { translateIn } from '../../i18n';
import { classRelative, criterionMarks, groupNotices, statusTag, workOnThisTopics } from './blockLogic';

jest.mock('../../store/settingsStore', () => ({ settingsStore: { getAll: () => ({ uiLanguage: 'ru' }) } }));
jest.mock('../../hooks/useSettings', () => ({ useSettings: () => ({ uiLanguage: 'ru' }) }));

const t = (path: string, vars?: Record<string, string | number>) => translateIn('ru', path, vars);

function school(over: Partial<StudentSchool> & { courseId?: string | null } = {}): StudentSchool {
  const { courseId = 'c1', ...rest } = over;
  return {
    membershipId: 'm1',
    schoolId: 's1',
    schoolName: 'Nordick',
    status: 'onboarding',
    groupId: 'g1',
    groupName: 'NO-A2',
    groups: [
      {
        groupId: 'g1',
        groupName: 'NO-A2',
        teachers: [],
        mainCourse: courseId ? { courseId, courseName: 'Ny i Norge' } : null,
        materials: [],
      },
    ],
    ...rest,
  };
}

describe('groupNotices', () => {
  it('announces a course a group opened that the learner has not opened', () => {
    expect(groupNotices([school()], new Set(), new Set())).toEqual([
      { membershipId: 'm1', groupName: 'NO-A2', schoolName: 'Nordick', courseId: 'c1', courseName: 'Ny i Norge' },
    ]);
  });

  it('says nothing once the course was opened, or the line was hidden', () => {
    expect(groupNotices([school()], new Set(['c1']), new Set())).toEqual([]);
    expect(groupNotices([school()], new Set(), new Set(['m1']))).toEqual([]);
  });

  it('falls back to the first material, and skips a group that opens nothing', () => {
    const s = school({ courseId: null });
    s.groups[0].materials = [{ courseId: 'c9', courseName: null }];
    expect(groupNotices([s], new Set(), new Set())[0]).toMatchObject({ courseId: 'c9', courseName: null });
    expect(groupNotices([school({ courseId: null })], new Set(), new Set())).toEqual([]);
  });

  it('ignores a school the learner left, and keeps one line per school', () => {
    expect(groupNotices([school({ status: 'left' })], new Set(), new Set())).toEqual([]);
    const two = school();
    two.groups.push({ ...two.groups[0], groupId: 'g2', mainCourse: { courseId: 'c2', courseName: 'B1' } });
    expect(groupNotices([two], new Set(), new Set())).toHaveLength(1);
  });
});

describe('statusTag', () => {
  it('maps the engine’s three states to the spec’s tags', () => {
    expect(statusTag('approved')).toEqual({ key: 'today.status.passed', variant: 'accent' });
    expect(statusTag('returned')).toEqual({ key: 'today.status.rewrite', variant: 'outline' });
    expect(statusTag('pending')).toEqual({ key: 'today.status.atTeacher', variant: 'neutral' });
  });
});

describe('classRelative', () => {
  const now = new Date(2026, 9, 24, 23, 30);
  it('counts calendar days, not hours', () => {
    expect(classRelative(new Date(2026, 9, 24, 23, 45), now, t)).toBe('сегодня');
    expect(classRelative(new Date(2026, 9, 25, 0, 15), now, t)).toBe('завтра');
    expect(classRelative(new Date(2026, 9, 26, 10, 0), now, t)).toBe('через 2 дня');
    expect(classRelative(new Date(2026, 9, 29, 10, 0), now, t)).toBe('через 5 дней');
  });
});

describe('workOnThisTopics', () => {
  const v = (skill: MasteryVerdict['skill'], focus: MasteryVerdict['focus']): MasteryVerdict => ({
    skill,
    focus,
    successRateEwma: 0.3,
    reason: null,
    meanStability: null,
    medianSecondsPerItem: null,
    attempts: 10,
    weightedSample: 9,
    lastAttemptAt: '2026-10-01T00:00:00.000Z',
  });

  it('names the skill when known, else the subject, and drops a cell that knows neither', () => {
    expect(workOnThisTopics([v('reading', 'grammar'), v('unknown', 'grammar'), v('unknown', 'unknown')], t)).toEqual([
      'Чтение',
      'Грамматика',
    ]);
  });

  it('keeps three at most, and one of each', () => {
    const cells = [v('reading', 'unknown'), v('reading', 'grammar'), v('written', 'unknown'), v('listening', 'unknown'), v('spoken', 'unknown')];
    expect(workOnThisTopics(cells, t)).toEqual(['Чтение', 'Письмо', 'Аудирование']);
  });
});

describe('criterionMarks', () => {
  const criteria = new Map([
    ['content', 'Содержание'],
    ['grammar', 'Грамматика'],
  ]);

  it('names an essay’s marks in rubric order', () => {
    expect(criterionMarks({ 'text:grammar': 2, 'text:content': 3 }, criteria)).toEqual([
      { name: 'Содержание', mark: 3 },
      { name: 'Грамматика', mark: 2 },
    ]);
  });

  it('shows nothing for marks across several items, or none at all', () => {
    expect(criterionMarks({ 's1:grammar': 2, 's2:grammar': 1 }, criteria)).toBeNull();
    expect(criterionMarks(null, criteria)).toBeNull();
    expect(criterionMarks({}, criteria)).toBeNull();
  });
});
