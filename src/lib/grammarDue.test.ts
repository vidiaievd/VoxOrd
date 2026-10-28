import type { DueGrammarRule } from '../api/grammarReview';
import { idleDays, pickGrammarRows, reviewMinutes } from './grammarDue';

const NOW = new Date('2026-10-28T10:00:00Z');

function rule(id: string, moduleId: string | null, masteryPercent: number, lastPracticedAt: string | null): DueGrammarRule {
  return {
    grammarRuleId: id,
    moduleId,
    poolSize: 5,
    masteryPercent,
    lastPracticedAt,
    strugglingCount: 0,
    dueReasons: ['stale'],
  };
}

describe('idleDays', () => {
  it('counts whole days and treats the future as today', () => {
    expect(idleDays('2026-10-21T11:00:00Z', NOW)).toBe(6);
    expect(idleDays('2026-10-21T09:00:00Z', NOW)).toBe(7);
    expect(idleDays('2026-10-29T09:00:00Z', NOW)).toBe(0);
    expect(idleDays(null, NOW)).toBeNull();
    expect(idleDays('not a date', NOW)).toBeNull();
  });
});

describe('pickGrammarRows', () => {
  it('merges courses, numbers units by course order, sorts by mastery and caps', () => {
    const rows = pickGrammarRows(
      [
        {
          courseId: 'c1',
          unitIds: ['u1', 'u2', 'u3'],
          rules: [rule('r1', 'u3', 60, '2026-10-18T10:00:00Z'), rule('r2', 'u1', 20, null)],
        },
        {
          courseId: 'c2',
          unitIds: ['v1'],
          rules: [rule('r3', 'v1', 40, null), rule('r4', 'v1', 10, null)],
        },
      ],
      NOW,
    );
    expect(rows.map(r => [r.ruleId, r.courseId, r.unitNumber, r.idleDays])).toEqual([
      ['r4', 'c2', 1, null],
      ['r2', 'c1', 1, null],
      ['r3', 'c2', 1, null],
    ]);
  });

  it('leaves out rules with no unit or a unit the course does not list', () => {
    const rows = pickGrammarRows(
      [{ courseId: 'c1', unitIds: ['u1'], rules: [rule('r1', null, 10, null), rule('r2', 'gone', 10, null), rule('r3', 'u1', 50, '2026-10-18T10:00:00Z')] }],
      NOW,
    );
    expect(rows).toEqual([
      { ruleId: 'r3', courseId: 'c1', unitId: 'u1', unitNumber: 1, masteryPercent: 50, idleDays: 10 },
    ]);
  });
});

describe('reviewMinutes', () => {
  it('is a minute per exercise, at least one', () => {
    expect(reviewMinutes(0)).toBe(1);
    expect(reviewMinutes(6)).toBe(6);
  });
});
