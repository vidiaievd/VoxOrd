import {
  isWrongVerdict,
  mergeMistakes,
  settledEntries,
  type CourseMistakes,
  type MistakeOverlayEntry,
  type ServerMistake,
} from './mistakes';

const server = (exerciseId: string, attemptedAt: string, unitId: string | null = 'u1'): ServerMistake => ({
  exerciseId,
  templateCode: 'multiple_choice',
  courseId: 'c1',
  unitId,
  title: `T ${exerciseId}`,
  attemptedAt,
});

const entry = (exerciseId: string, wrong: boolean, at: string, courseId = 'c1'): MistakeOverlayEntry => ({
  userId: 'me',
  exerciseId,
  wrong,
  at,
  templateCode: 'fill_in_blank',
  courseId,
  unitId: 'u2',
  title: null,
});

const course = (items: ServerMistake[], total = items.length): CourseMistakes => ({
  courseId: 'c1',
  items,
  total,
  unitIds: ['u1', 'u2'],
});

describe('isWrongVerdict', () => {
  it('reads the pass mark, or `correct` when unscored', () => {
    expect(isWrongVerdict({ correct: false, score: 70 })).toBe(false);
    expect(isWrongVerdict({ correct: true, score: 69 })).toBe(true);
    expect(isWrongVerdict({ correct: false, score: null })).toBe(true);
    expect(isWrongVerdict({ correct: true, score: null })).toBe(false);
  });
});

describe('mergeMistakes', () => {
  it('shows the server list newest first with unit numbers, capped', () => {
    const result = mergeMistakes(
      [course([server('a', '2026-10-01T00:00:00Z'), server('b', '2026-10-03T00:00:00Z'), server('c', '2026-10-02T00:00:00Z'), server('d', '2026-09-01T00:00:00Z')], 9)],
      [],
    );
    expect(result.rows.map(r => [r.exerciseId, r.unitNumber])).toEqual([['b', 1], ['c', 1], ['a', 1]]);
    expect(result.total).toBe(9);
  });

  it('adds a mistake only the phone knows and counts it', () => {
    const result = mergeMistakes([course([server('a', '2026-10-01T00:00:00Z')], 4)], [entry('x', true, '2026-10-28T09:00:00Z')]);
    expect(result.rows[0]).toMatchObject({ exerciseId: 'x', unitId: 'u2', unitNumber: 2, templateCode: 'fill_in_blank' });
    expect(result.total).toBe(5);
  });

  it('takes off a corrected exercise and lowers the total', () => {
    const result = mergeMistakes([course([server('a', '2026-10-01T00:00:00Z')], 4)], [entry('a', false, '2026-10-28T09:00:00Z')]);
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(3);
  });

  it('lets the server win over an older verdict, and the latest verdict win over earlier ones', () => {
    const older = mergeMistakes([course([server('a', '2026-10-28T10:00:00Z')])], [entry('a', false, '2026-10-28T09:00:00Z')]);
    expect(older.rows.map(r => r.exerciseId)).toEqual(['a']);

    const twice = mergeMistakes(
      [course([])],
      [entry('x', true, '2026-10-28T09:00:00Z'), entry('x', false, '2026-10-28T09:05:00Z')],
    );
    expect(twice).toEqual({ rows: [], total: 0 });
  });

  it('keeps a wrong verdict on a known mistake without counting it twice, title kept', () => {
    const result = mergeMistakes([course([server('a', '2026-10-01T00:00:00Z')], 1)], [entry('a', true, '2026-10-28T09:00:00Z')]);
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ title: 'T a', attemptedAt: '2026-10-28T09:00:00Z' });
  });

  it('leaves out rows without a unit the course lists, and verdicts of other courses', () => {
    const result = mergeMistakes(
      [course([server('a', '2026-10-01T00:00:00Z', null), server('b', '2026-10-01T00:00:00Z', 'gone')], 2)],
      [entry('x', true, '2026-10-28T09:00:00Z', 'c9')],
    );
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(2);
  });
});

describe('settledEntries', () => {
  it('settles what came before the answer and is not waiting to be sent', () => {
    const entries = [entry('a', true, '2026-10-28T09:00:00Z'), entry('b', true, '2026-10-28T09:00:00Z'), entry('c', true, '2026-10-28T11:00:00Z')];
    expect(settledEntries(entries, '2026-10-28T10:00:00Z', new Set(['b'])).map(e => e.exerciseId)).toEqual(['a']);
  });
});
