import type { StudentSchool } from '../../api/schools';
import { includedRows, schoolCourseRows } from './subscriptionLogic';

const t = (p: string, v?: Record<string, string | number>) =>
  v ? `${p}:${JSON.stringify(v)}` : p;

const ent = (keys: string[]) => ({
  features: Object.fromEntries(
    keys.map(k => [k, { enabled: true, monthlyCredits: null }]),
  ),
  validUntil: '2030-01-01T00:00:00Z',
});

describe('includedRows', () => {
  it('lists enabled known features only', () => {
    const rows = includedRows(ent(['ai.practice', 'ai.authoring']), null, t);
    expect(rows.map(r => r.key)).toEqual(['ai.practice']);
  });
  it('puts the credits on the metered feature', () => {
    const rows = includedRows(
      ent(['ai.review_direct']),
      { used: 3, total: 20, fill: 0.15, low: false },
      t,
    );
    expect(rows[0].value).toBe('subscription.ofTotal:{"used":3,"total":20}');
  });
  it('is empty without rights', () => {
    expect(includedRows(null, null, t)).toEqual([]);
  });
});

const school = (name: string, courses: [string, string | null][]): StudentSchool => ({
  membershipId: 'm',
  schoolId: name,
  schoolName: name,
  status: 'active',
  groupId: 'g',
  groupName: 'G',
  groups: [
    {
      groupId: 'g',
      groupName: 'G',
      teachers: [],
      mainCourse: { courseId: courses[0][0], courseName: courses[0][1] },
      materials: courses
        .slice(1)
        .map(([courseId, courseName]) => ({ courseId, courseName })),
    },
  ],
});

describe('schoolCourseRows', () => {
  it('dedupes by course and skips untitled ones', () => {
    const rows = schoolCourseRows([
      school('A', [['c1', 'One'], ['c2', null], ['c1', 'One']]),
      school('B', [['c3', 'Three']]),
    ]);
    expect(rows).toEqual([
      { courseId: 'c1', title: 'One', schoolName: 'A' },
      { courseId: 'c3', title: 'Three', schoolName: 'B' },
    ]);
  });
  it('is empty for no schools', () => {
    expect(schoolCourseRows(null)).toEqual([]);
  });
});
